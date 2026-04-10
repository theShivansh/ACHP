"""
ACHP — NIL Layer  (nil_layer.py)
=================================
Narrative Integrity Layer: 5 async sub-agents launched in parallel via
asyncio.gather().  Each sub-agent is self-contained and writes exactly
one key into the shared NILResult.

Sub-agents                 Model          Metric          Mode
──────────────────────────────────────────────────────────────
1. SentimentEPS            VADER+Groq     EPS             offline→LLM
2. BiasDeepSeek            DeepSeek-chat  BIS             OpenRouter
3. PerspectiveLlama        Llama-4-Scout  PCS+opposites   Groq
4. FramingCosine           all-MiniLM     framing_score   local embed
5. ConfidenceSynthesizer   deterministic  final NIL score math

Parallel budget: each sub-agent runs independently.
The slowest sub-agent (Perspective ~5s) determines wall-clock time.
All others complete in <1s offline / ~3s with APIs.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import hashlib
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Module-level encoder singleton — loads ONCE at startup, not per-request
# Switch: all-MiniLM-L6-v2 (90MB, ~60s cold) → paraphrase-MiniLM-L3-v2 (17MB, ~3s cold)
# Same framing-cosine quality, 5× faster cold start, 2× faster inference.
# ─────────────────────────────────────────────────────────────────────────────
_EMBED_MODEL = os.getenv("NIL_EMBED_MODEL", "paraphrase-MiniLM-L3-v2")
_encoder_singleton = None
_encoder_ok        = False

def _get_encoder_singleton():
    global _encoder_singleton, _encoder_ok
    if _encoder_singleton is None:
        try:
            from sentence_transformers import SentenceTransformer
            _encoder_singleton = SentenceTransformer(_EMBED_MODEL)
            _encoder_ok        = True
            logger.info(f"NIL encoder loaded: {_EMBED_MODEL}")
        except Exception as e:
            logger.warning(f"NIL encoder unavailable ({e}) — using lexical-only framing")
    return _encoder_singleton

# ─────────────────────────────────────────────────────────────────────────────
# Shared Result Dataclass
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SubAgentResult:
    name: str
    ok: bool
    data: Dict[str, Any]
    latency_ms: float
    model: Optional[str] = None
    error: Optional[str] = None


@dataclass
class NILResult:
    # Raw sub-agent outputs
    sentiment:    SubAgentResult = field(default_factory=lambda: SubAgentResult("sentiment",    False, {}, 0.0))
    bias:         SubAgentResult = field(default_factory=lambda: SubAgentResult("bias",         False, {}, 0.0))
    perspective:  SubAgentResult = field(default_factory=lambda: SubAgentResult("perspective",  False, {}, 0.0))
    framing:      SubAgentResult = field(default_factory=lambda: SubAgentResult("framing",      False, {}, 0.0))
    synthesizer:  SubAgentResult = field(default_factory=lambda: SubAgentResult("synthesizer",  False, {}, 0.0))

    # Final ACHP scores (set by Synthesizer)
    EPS:              float = 0.0   # Epistemic Position Score
    BIS:              float = 0.0   # Bias Impact Score
    PCS:              float = 0.0   # Perspective Completeness Score
    framing_score:    float = 0.0
    nil_confidence:   float = 0.0
    nil_verdict:      str   = "unknown"
    nil_summary:      str   = ""

    total_latency_ms: float = 0.0
    parallel_budget_ms: float = 0.0   # wall-clock time (max sub-agent latency)
    input_hash: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Sub-Agent 1 — Sentiment → EPS
# ─────────────────────────────────────────────────────────────────────────────

class SentimentEPS:
    """
    Computes EPS (Epistemic Position Score) — how well-calibrated
    the claim's certainty level is vs its actual verifiability.

    Primary:  VADER for fast offline polarity
    Enhanced: Groq Llama-4-Scout for epistemic hedge detection
              (uses extra_body tool_choice=none, json mode)
    """
    NAME  = "sentiment"
    MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

    LOADED_WORDS = {
        # negative loading
        "crisis","catastrophe","disaster","threat","danger","extreme","radical",
        "unprecedented","shocking","outrageous","explosive","toxic","devastating",
        "alarming","imminent","reckless","corrupt","fraudulent",
        # positive loading
        "brilliant","revolutionary","groundbreaking","miraculous","outstanding",
        "game-changer","historic","landmark","unprecedented",
        # epistemic hedges (good — reduce emotional loading penalty)
        "suggests","may","could","might","according to","reportedly","apparently",
        "analysts say","experts believe","evidence indicates","studies show",
    }
    HEDGE_WORDS = {"suggests","may","could","might","reportedly","apparently","believes","seems","appears"}

    def __init__(self, use_llm: bool = True):
        self.use_llm = use_llm and bool(os.getenv("GROQ_API_KEY"))
        self._vader  = None
        self._client = None

    def _vader(self):
        if self._vader_inst is None:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            self._vader_inst = SentimentIntensityAnalyzer()
        return self._vader_inst
    _vader_inst = None            # store instance separately to avoid name clash

    def _get_groq(self):
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        return self._client

    async def run(self, text: str) -> SubAgentResult:
        t0 = time.perf_counter()
        try:
            # ── VADER base ──────────────────────────────────────────────
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            vader = SentimentIntensityAnalyzer()
            scores = vader.polarity_scores(text)
            compound = scores["compound"]

            words_lower = text.lower().split()
            loaded = [w.strip(".,!?") for w in words_lower if w.strip(".,!?") in self.LOADED_WORDS]
            hedges = [w.strip(".,!?") for w in words_lower if w.strip(".,!?") in self.HEDGE_WORDS]
            hedge_ratio = len(hedges) / max(len(words_lower), 1)

            # Base EPS: high polarity = low epistemic quality, hedges redeem
            emotion_penalty = abs(compound)
            hedge_bonus     = min(0.3, hedge_ratio * 3)
            eps_base        = max(0.0, 1.0 - emotion_penalty + hedge_bonus)

            classification = (
                "strongly_positive" if compound >= 0.5 else
                "mildly_positive"   if compound >= 0.1 else
                "strongly_negative" if compound <= -0.5 else
                "mildly_negative"   if compound <= -0.1 else "neutral"
            )

            data = {
                "polarity":          round(compound, 4),
                "classification":    classification,
                "loaded_words":      loaded[:8],
                "hedge_words":       hedges[:5],
                "hedge_ratio":       round(hedge_ratio, 4),
                "EPS":               round(eps_base, 4),
                "vader_scores":      {"pos": scores["pos"], "neg": scores["neg"], "neu": scores["neu"]},
                "llm_enhanced":      False,
            }

            # ── Optional Groq LLM enhancement ──────────────────────────
            if self.use_llm and len(text) >= 20:
                try:
                    client = self._get_groq()
                    resp = await asyncio.wait_for(client.chat.completions.create(
                        model=self.MODEL,
                        messages=[{
                            "role": "system",
                            "content": (
                                "Rate the epistemic quality of this text. "
                                "Output JSON only: {\"epistemic_quality\": 0.0-1.0, "
                                "\"overclaiming\": true/false, \"hedging_adequate\": true/false, "
                                "\"loaded_language\": [\"word\"]}"
                            )
                        }, {"role": "user", "content": text[:600]}],
                        temperature=0.05, max_tokens=256,
                        response_format={"type": "json_object"},
                    ), timeout=10)
                    llm_out = json.loads(resp.choices[0].message.content)
                    # Blend LLM epistemic_quality with VADER-derived score
                    llm_eps = llm_out.get("epistemic_quality", eps_base)
                    data["EPS"] = round((eps_base * 0.4 + llm_eps * 0.6), 4)
                    data["llm_enhanced"] = True
                    data["llm_overclaiming"] = llm_out.get("overclaiming", False)
                    data["llm_loaded_language"] = llm_out.get("loaded_language", [])
                except Exception as e:
                    logger.debug(f"SentimentEPS LLM enhancement skipped: {e}")

            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, True, data, latency, self.MODEL)

        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, False, {}, latency, error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Sub-Agent 2 — Bias → BIS  (DeepSeek via OpenRouter)
# ─────────────────────────────────────────────────────────────────────────────

BIAS_AXES = [
    "political_left","political_right","corporate","nationalist","gender_stereotyping",
    "racial","cultural_western","academic_elitism","confirmation_bias","sensationalism",
]

BIAS_SYSTEM = """\
You are an expert media bias analyst. Analyze the text for bias indicators.
Output ONLY valid JSON:
{
  "bias_axes": {
    "political_left": 0.0-1.0,
    "political_right": 0.0-1.0,
    "corporate": 0.0-1.0,
    "nationalist": 0.0-1.0,
    "gender_stereotyping": 0.0-1.0,
    "racial": 0.0-1.0,
    "cultural_western": 0.0-1.0,
    "academic_elitism": 0.0-1.0,
    "confirmation_bias": 0.0-1.0,
    "sensationalism": 0.0-1.0
  },
  "dominant_bias": "axis_name",
  "BIS": 0.0-1.0,
  "evidence": ["specific phrase or pattern that shows bias"],
  "reasoning": "one-sentence explanation"
}"""

class BiasGroq:
    NAME    = "bias"
    MODEL   = "llama-3.3-70b-versatile"   # Groq primary
    FALLBACK= "llama-3.3-70b-versatile"   # same — very reliable

    _KEYWORD_MAP = {
        "political_left":    ["progressive","liberal","socialist","left-wing","democrat","marxist"],
        "political_right":   ["conservative","republican","right-wing","nationalist","fascist","patriot"],
        "corporate":         ["shareholders","profits","market","investors","quarterly","revenue"],
        "sensationalism":    ["shocking","explosive","bombshell","outrage","scandal","unprecedented","crisis"],
        "gender_stereotyping": ["he","she","women should","men are","typical female","typical male"],
        "racial":            ["illegal aliens","urban","thug","terrorism","radical islam","heritage"],
    }

    def __init__(self, use_llm: bool = True):
        self.use_llm = use_llm and bool(os.getenv("GROQ_API_KEY"))
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1",
            )
        return self._client

    def _heuristic(self, text: str) -> Dict[str, Any]:
        text_lower  = text.lower()
        scores      = {ax: 0.05 for ax in BIAS_AXES}
        evidence    = []
        for ax, kws in self._KEYWORD_MAP.items():
            hits = [kw for kw in kws if kw in text_lower]
            if hits:
                scores[ax] = min(1.0, 0.05 + 0.25 * len(hits))
                evidence.extend(hits[:2])
        dominant   = max(scores, key=scores.get)
        bis        = round(min(1.0, sum(scores.values()) / len(scores) * 3), 4)
        return {"bias_axes": scores, "dominant_bias": dominant, "BIS": bis,
                "evidence": evidence[:6], "reasoning": "keyword-heuristic fallback", "method": "heuristic"}

    async def run(self, text: str) -> SubAgentResult:
        t0 = time.perf_counter()
        try:
            if self.use_llm:
                try:
                    client = self._get_client()
                    resp = await asyncio.wait_for(client.chat.completions.create(
                        model=self.MODEL,
                        messages=[
                            {"role": "system", "content": BIAS_SYSTEM},
                            {"role": "user",   "content": f"Analyze bias in: {text[:1500]}"},
                        ],
                        temperature=0.1, max_tokens=512,
                    ), timeout=20)
                    raw = resp.choices[0].message.content
                    # Strip possible markdown/think tags
                    if "<think>" in raw:
                        raw = raw.split("</think>")[-1].strip()
                    if raw.startswith("```"):
                        raw = raw.split("```")[1]
                        if raw.startswith("json"):
                            raw = raw[4:]
                    data = json.loads(raw.strip())
                    data["method"] = "groq-llm"
                except Exception as e:
                    logger.warning(f"BiasGroq LLM failed ({e}), using heuristic")
                    data = self._heuristic(text)
            else:
                data = self._heuristic(text)

            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, True, data, latency, data.get("method",""))
        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, False, {}, latency, error=str(e))

# Keep old name as alias for any imports elsewhere
BiasDeepSeek = BiasGroq


# ─────────────────────────────────────────────────────────────────────────────
# Sub-Agent 3 — Perspective Generator → PCS  (Groq Llama-4-Scout)
# ─────────────────────────────────────────────────────────────────────────────

PERSPECTIVE_SYSTEM = """\
You are an expert at generating balanced, multi-stakeholder perspectives.

Given a claim, produce:
1. An OPPOSING perspective (disagrees, with reasoning)
2. A NEUTRAL perspective (academic/objective framing)
3. List any MISSING stakeholders whose views are absent

Output ONLY JSON:
{
  "opposing": {
    "stakeholder": "who holds this view",
    "viewpoint": "their perspective (2-3 sentences)",
    "key_arguments": ["arg1","arg2"]
  },
  "neutral": {
    "stakeholder": "academic/researcher",
    "viewpoint": "balanced framing (2-3 sentences)",
    "key_considerations": ["point1","point2"]
  },
  "missing_stakeholders": [
    {"group": "name", "likely_view": "summary", "significance": 0.0-1.0}
  ],
  "PCS": 0.0-1.0,
  "perspective_note": "one-sentence summary of perspective landscape"
}"""

class PerspectiveLlama:
    NAME    = "perspective"
    MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct"
    FALLBACK= "llama-3.3-70b-versatile"

    def __init__(self, use_llm: bool = True):
        self.use_llm = use_llm and bool(os.getenv("GROQ_API_KEY"))
        self._client = None

    def _get_client(self):
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        return self._client

    def _offline_fallback(self, text: str) -> Dict[str, Any]:
        return {
            "opposing":  {"stakeholder": "skeptic", "viewpoint": "[Needs GROQ_API_KEY]", "key_arguments": []},
            "neutral":   {"stakeholder": "researcher", "viewpoint": "[Needs GROQ_API_KEY]", "key_considerations": []},
            "missing_stakeholders": [],
            "PCS": 0.5,
            "perspective_note": "offline fallback — set GROQ_API_KEY for full perspective generation",
            "method": "offline",
        }

    async def run(self, text: str) -> SubAgentResult:
        t0 = time.perf_counter()
        try:
            if not self.use_llm:
                data    = self._offline_fallback(text)
                latency = (time.perf_counter() - t0) * 1000
                return SubAgentResult(self.NAME, True, data, latency, "offline")

            client  = self._get_client()
            model   = self.MODEL
            try:
                resp = await asyncio.wait_for(client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": PERSPECTIVE_SYSTEM},
                        {"role": "user",   "content": f'Claim: "{text[:800]}"'},
                    ],
                    temperature=0.4, max_tokens=1024,
                    response_format={"type": "json_object"},
                ), timeout=25)
            except Exception:
                resp = await asyncio.wait_for(client.chat.completions.create(
                    model=self.FALLBACK,
                    messages=[
                        {"role": "system", "content": PERSPECTIVE_SYSTEM},
                        {"role": "user",   "content": f'Claim: "{text[:800]}"'},
                    ],
                    temperature=0.4, max_tokens=1024,
                    response_format={"type": "json_object"},
                ), timeout=25)
                model = self.FALLBACK

            data = json.loads(resp.choices[0].message.content)
            data["method"] = model
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, True, data, latency, model)

        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000
            logger.warning(f"PerspectiveLlama failed: {e}")
            return SubAgentResult(self.NAME, False, self._offline_fallback(text), latency, error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Sub-Agent 4 — Framing Comparator (Cosine Similarity)
# ─────────────────────────────────────────────────────────────────────────────

# Reference framings (neutral baselines for cosine comparison)
NEUTRAL_FRAMES: Dict[str, str] = {
    "factual":    "According to available evidence, the situation shows the following characteristics.",
    "scientific": "Research indicates mixed results. Scientists continue to study contributing factors.",
    "economic":   "Market data suggests various factors influence the economic situation.",
    "political":  "Different political perspectives offer varying analyses of the policy implications.",
    "social":     "Community stakeholders hold diverse views about the social dimensions.",
    "historical": "Historical records document a complex sequence of events with multiple interpretations.",
}

class FramingCosine:
    """
    Uses sentence-transformers cosine similarity to measure how far the text's
    framing deviates from neutral reference templates.
    Also runs lexical framing analysis (presuppositions, agenda, loaded phrases).
    """
    NAME = "framing"

    PRESUPPOSITIONS = [
        "when","since","because","obviously","clearly","of course",
        "as everyone knows","despite","although","even though","still","yet",
        "inevitably","undeniably","without question","the truth is",
        "everyone knows","it's obvious","clearly shows","proven fact",
    ]
    AGENDA_WORDS = [
        "must","should","need to","have to","urgent","immediately",
        "demand","require","force","compel","inevitably","wake up",
        "rise up","fight back","defend","stand up","now or never",
        "act now","before it's too late","push back",
    ]
    LOADED_MAP = {
        # Alarm / threat framing
        "crisis":     "alarm","catastrophe": "alarm","disaster": "alarm","threat": "alarm",
        "collapse":   "alarm","destroying":  "alarm","devastat": "alarm","existential": "alarm",
        # Delegitimizing framing
        "regime":     "delegitimize","propaganda": "delegitimize","extremist": "delegitimize",
        "criminal": "delegitimize","corrupt": "delegitimize","radical": "delegitimize",
        "lying":     "delegitimize","cover up": "delegitimize","covering up": "delegitimize",
        "cover-up":  "delegitimize","mainstream media": "delegitimize",
        # Conspiracy framing
        "wake up":   "conspiracy","sheeple": "conspiracy","truth is hidden": "conspiracy",
        "they don't want you": "conspiracy","big pharma": "conspiracy",
        # Legitimizing framing
        "freedom fighter": "legitimize","hero": "legitimize","champion": "legitimize",
        "patriot": "legitimize",
        # Hype framing
        "breakthrough": "hype","miracle": "hype","revolutionary": "hype",
        "unprecedented": "hype","historic": "hype",
    }

    def __init__(self):
        # Use the module-level singleton — never re-loads the model
        pass

    def _get_encoder(self):
        return _get_encoder_singleton()

    def _cosine(self, a, b) -> float:
        import numpy as np
        a, b = np.array(a), np.array(b)
        denom = (np.linalg.norm(a) * np.linalg.norm(b))
        return float(np.dot(a, b) / denom) if denom > 0 else 0.0

    async def run(self, text: str, reference_text: str = "") -> SubAgentResult:
        t0 = time.perf_counter()
        try:
            text_lower = text.lower()

            # ── Lexical analysis ──────────────────────────────────────
            presuppositions = [m for m in self.PRESUPPOSITIONS if m in text_lower]
            agenda          = [m for m in self.AGENDA_WORDS     if m in text_lower]

            loaded_found: Dict[str, List[str]] = {}
            for phrase, frame_type in self.LOADED_MAP.items():
                if phrase in text_lower:
                    loaded_found.setdefault(frame_type, []).append(phrase)

            passive = re.findall(r'\b(was|were|been|is|are)\s+\w+ed\b', text_lower)
            passive_ratio = len(passive) / max(len(text.split()), 1)

            # ── Cosine similarity vs neutral frames ───────────────────
            cosine_scores: Dict[str, float] = {}
            closest_frame = "factual"
            max_cosine    = 0.0

            encoder = _get_encoder_singleton()
            if encoder and _encoder_ok:
                loop = asyncio.get_event_loop()
                def _encode_all():
                    anchors = list(NEUTRAL_FRAMES.values())
                    all_texts = [text] + anchors
                    return encoder.encode(all_texts, normalize_embeddings=True)

                try:
                    embeds = await loop.run_in_executor(None, _encode_all)
                    text_embed = embeds[0]
                    for i, (fname, _) in enumerate(NEUTRAL_FRAMES.items()):
                        sim = self._cosine(text_embed, embeds[i + 1])
                        cosine_scores[fname] = round(sim, 4)
                    closest_frame = max(cosine_scores, key=cosine_scores.get)
                    max_cosine    = cosine_scores[closest_frame]
                except Exception as e:
                    logger.debug(f"Cosine encoding failed: {e}")

            # If reference text provided, compute direct similarity
            ref_similarity = None
            if reference_text and _encoder_ok and _encoder_singleton:
                try:
                    loop = asyncio.get_event_loop()
                    def _ref_encode():
                        return encoder.encode([text, reference_text], normalize_embeddings=True)
                    ref_embeds    = await loop.run_in_executor(None, _ref_encode)
                    ref_similarity = round(self._cosine(ref_embeds[0], ref_embeds[1]), 4)
                except Exception:
                    pass

            # ── Framing score ─────────────────────────────────────────
            lexical_score = min(1.0,
                0.08 * len(presuppositions) +
                0.12 * len(agenda) +
                0.18 * len(loaded_found) +
                0.25 * passive_ratio
            )
            # High cosine with "factual" → lower framing score
            neutrality_bonus = cosine_scores.get("factual", 0.0) * 0.3
            framing_score    = max(0.0, min(1.0, lexical_score - neutrality_bonus))

            dominant = max(loaded_found, key=lambda k: len(loaded_found[k])) if loaded_found else "neutral"

            data = {
                "framing_score":     round(framing_score, 4),
                "lexical_score":     round(lexical_score, 4),
                "cosine_vs_neutral": cosine_scores,
                "closest_neutral_frame": closest_frame,
                "max_neutrality_cosine": round(max_cosine, 4),
                "reference_similarity":  ref_similarity,
                "dominant_frame":    dominant,
                "loaded_phrases":    loaded_found,
                "presuppositions":   presuppositions[:5],
                "agenda_indicators": agenda[:5],
                "passive_ratio":     round(passive_ratio, 4),
                "embed_available":   _encoder_ok,
            }
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, True, data, latency, _EMBED_MODEL if _encoder_ok else "lexical-only")
        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, False, {}, latency, error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Sub-Agent 5 — Confidence Synthesizer → Final Scores
# ─────────────────────────────────────────────────────────────────────────────

WEIGHT_MATRIX = {
    # (component, weight) — sum = 1.0
    "BIS": [
        ("bias_score",     0.60),
        ("framing_score",  0.25),
        ("polarity_abs",   0.15),
    ],
    "EPS": [
        ("eps_raw",        0.70),
        ("framing_inv",    0.20),
        ("hedge_ratio",    0.10),
    ],
    "PCS": [
        ("pcs_llm",        0.75),
        ("missing_count",  0.25),   # normalised against 5 expected
    ],
}

VERDICT_THRESHOLDS = [
    (0.75, "propaganda"),
    (0.45, "misleading"),
    (0.30, "biased"),
    (0.18, "mildly_biased"),
    (0.00, "neutral"),
]

class ConfidenceSynthesizer:
    NAME = "synthesizer"

    def run(
        self,
        sentiment: SubAgentResult,
        bias:      SubAgentResult,
        persp:     SubAgentResult,
        framing:   SubAgentResult,
    ) -> SubAgentResult:
        t0 = time.perf_counter()
        try:
            s = sentiment.data
            b = bias.data
            p = persp.data
            f = framing.data

            # ── Extract raw components ───────────────────────────────
            eps_raw      = s.get("EPS",          0.5)
            polarity_abs = abs(s.get("polarity", 0.0))
            hedge_ratio  = s.get("hedge_ratio",  0.0)

            bis_raw      = b.get("BIS",          0.1)
            framing_sc   = f.get("framing_score",0.1)
            framing_inv  = 1.0 - framing_sc      # high framing → low EPS

            pcs_llm      = p.get("PCS",          0.5)
            missing_n    = len(p.get("missing_stakeholders", []))
            pcs_miss     = min(1.0, missing_n / 5)   # 5+ missing → score 1.0

            # ── Framing-type boost ────────────────────────────────────
            # Delegitimize or conspiracy framing amplifies BIS significantly
            dominant_frame = f.get("dominant_frame", "neutral")
            framing_boost  = 0.0
            if dominant_frame in ("delegitimize", "conspiracy"):
                framing_boost = 0.15
            elif dominant_frame in ("alarm",):
                framing_boost = 0.05

            # ── Weighted BIS ─────────────────────────────────────────
            BIS = round(min(1.0, max(0.0,
                0.55 * bis_raw +
                0.25 * framing_sc +
                0.12 * polarity_abs +
                framing_boost
            )), 4)

            # ── Weighted EPS ─────────────────────────────────────────
            EPS = round(min(1.0, max(0.0,
                0.70 * eps_raw +
                0.20 * framing_inv +
                0.10 * min(1.0, hedge_ratio * 5)
            )), 4)

            # ── Weighted PCS ─────────────────────────────────────────
            PCS = round(min(1.0, max(0.0,
                0.75 * pcs_llm +
                0.25 * (1.0 - pcs_miss)   # fewer missing → higher PCS
            )), 4)

            # ── NIL confidence (higher = more narrative integrity issues)
            # Extra weight on framing when delegitimize/conspiracy present
            framing_weight = 0.25 if dominant_frame in ("delegitimize","conspiracy","alarm") else 0.15
            nil_confidence = round(min(1.0,
                0.35 * BIS +
                0.25 * (1.0 - EPS) +
                0.20 * (1.0 - PCS) +
                framing_weight * framing_sc
            ), 4)

            # ── Verdict ──────────────────────────────────────────────
            verdict = "neutral"
            for thresh, label in VERDICT_THRESHOLDS:
                if nil_confidence >= thresh:
                    verdict = label
                    break

            # ── Summary ──────────────────────────────────────────────
            dominant_bias = b.get("dominant_bias", "unknown")
            dom_frame     = f.get("dominant_frame", "neutral")
            summary = (
                f"NIL verdict: {verdict} (score={nil_confidence:.2f}). "
                f"BIS={BIS:.2f} (dominant: {dominant_bias}). "
                f"EPS={EPS:.2f}. PCS={PCS:.2f}. "
                f"Framing: {dom_frame} ({framing_sc:.2f}). "
                f"Missing perspectives: {missing_n}."
            )

            data = {
                "BIS":           BIS,
                "EPS":           EPS,
                "PCS":           PCS,
                "framing_score": round(framing_sc, 4),
                "nil_confidence": nil_confidence,
                "nil_verdict":   verdict,
                "nil_summary":   summary,
                "components": {
                    "bis_raw":    round(bis_raw, 4),
                    "eps_raw":    round(eps_raw, 4),
                    "pcs_llm":    round(pcs_llm, 4),
                    "framing_sc": round(framing_sc, 4),
                    "polarity":   round(polarity_abs, 4),
                    "hedge_ratio":round(hedge_ratio, 4),
                    "missing_n":  missing_n,
                },
                "weight_matrix": WEIGHT_MATRIX,
            }
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, True, data, latency, "deterministic")

        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000
            return SubAgentResult(self.NAME, False, {}, latency, error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# NIL Layer — Orchestrates all 5 in parallel
# ─────────────────────────────────────────────────────────────────────────────

class NILLayer:
    """
    Concurrent NIL analysis layer.
    Usage:
        layer  = NILLayer()
        result = await layer.run("AI will replace all human jobs by 2030.")
    """

    def __init__(
        self,
        use_groq_llm:     Optional[bool] = None,
        use_openrouter:   Optional[bool] = None,
    ):
        # Auto-detect from env
        has_groq  = bool(os.getenv("GROQ_API_KEY"))

        self._sentiment  = SentimentEPS    (use_llm=use_groq_llm   if use_groq_llm   is not None else has_groq)
        self._bias       = BiasGroq        (use_llm=use_groq_llm   if use_groq_llm   is not None else has_groq)
        self._perspective= PerspectiveLlama(use_llm=use_groq_llm   if use_groq_llm   is not None else has_groq)
        self._framing    = FramingCosine   ()
        self._synth      = ConfidenceSynthesizer()

        logger.info(
            f"NILLayer ready | groq={'on' if has_groq else 'off'} | openrouter=disabled"
        )
        # Pre-warm the encoder singleton NOW (at startup) so first request is fast
        import threading
        threading.Thread(target=_get_encoder_singleton, daemon=True).start()

    async def _safe(self, name: str, coro) -> SubAgentResult:
        try:
            return await coro
        except Exception as e:
            logger.warning(f"NIL sub-agent '{name}' crashed: {e}")
            return SubAgentResult(name, False, {}, 0.0, error=str(e))

    async def run(self, text: str, reference_text: str = "") -> NILResult:
        """
        Run all 4 analysis sub-agents in parallel, then synthesize.
        """
        t_wall = time.perf_counter()
        input_hash = hashlib.sha256(text.encode()).hexdigest()[:12]

        # ── Parallel launch: 4 analysis agents ──────────────────────
        sent_res, bias_res, persp_res, frame_res = await asyncio.gather(
            self._safe("sentiment",   self._sentiment.run(text)),
            self._safe("bias",        self._bias.run(text)),
            self._safe("perspective", self._perspective.run(text)),
            self._safe("framing",     self._framing.run(text, reference_text)),
        )

        parallel_budget = (time.perf_counter() - t_wall) * 1000

        # ── Sequential: synthesize after all 4 finish ────────────────
        synth_res = self._synth.run(sent_res, bias_res, persp_res, frame_res)

        total_latency = (time.perf_counter() - t_wall) * 1000

        result = NILResult(
            sentiment    = sent_res,
            bias         = bias_res,
            perspective  = persp_res,
            framing      = frame_res,
            synthesizer  = synth_res,
            EPS          = synth_res.data.get("EPS",  0.0),
            BIS          = synth_res.data.get("BIS",  0.0),
            PCS          = synth_res.data.get("PCS",  0.0),
            framing_score= synth_res.data.get("framing_score", 0.0),
            nil_confidence   = synth_res.data.get("nil_confidence", 0.0),
            nil_verdict      = synth_res.data.get("nil_verdict", "unknown"),
            nil_summary      = synth_res.data.get("nil_summary", ""),
            total_latency_ms = round(total_latency, 2),
            parallel_budget_ms = round(parallel_budget, 2),
            input_hash   = input_hash,
        )

        logger.info(
            f"NILLayer complete | {result.nil_verdict} | "
            f"BIS={result.BIS:.2f} EPS={result.EPS:.2f} PCS={result.PCS:.2f} | "
            f"wall={total_latency:.0f}ms para={parallel_budget:.0f}ms"
        )
        return result

    def serialize(self, result: NILResult) -> Dict[str, Any]:
        """Convert NILResult to JSON-serializable dict."""
        def _sub(r: SubAgentResult) -> Dict:
            return {
                "name": r.name, "ok": r.ok, "model": r.model,
                "latency_ms": round(r.latency_ms, 2),
                "error": r.error, "data": r.data,
            }
        return {
            "input_hash":    result.input_hash,
            "EPS":           result.EPS,
            "BIS":           result.BIS,
            "PCS":           result.PCS,
            "framing_score": result.framing_score,
            "nil_confidence":result.nil_confidence,
            "nil_verdict":   result.nil_verdict,
            "nil_summary":   result.nil_summary,
            "total_latency_ms":     result.total_latency_ms,
            "parallel_budget_ms":   result.parallel_budget_ms,
            "sub_agents": {
                "sentiment":   _sub(result.sentiment),
                "bias":        _sub(result.bias),
                "perspective": _sub(result.perspective),
                "framing":     _sub(result.framing),
                "synthesizer": _sub(result.synthesizer),
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")

    parser = argparse.ArgumentParser(description="ACHP NIL Layer")
    parser.add_argument("--text",    type=str, default="Climate change is an existential crisis threatening humanity.")
    parser.add_argument("--offline", action="store_true", help="Force offline mode (no API calls)")
    args = parser.parse_args()

    async def _main():
        layer = NILLayer(
            use_groq_llm=not args.offline,
            use_openrouter=not args.offline,
        )
        result = await layer.run(args.text)
        out = layer.serialize(result)
        print(json.dumps(out, indent=2))

    asyncio.run(_main())

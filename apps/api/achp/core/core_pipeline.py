"""
ACHP — Core Pipeline  (core_pipeline.py)
==========================================
Single source of truth connecting all 7 agents in the exact sequence:

  User Query
      │
  [1] SecurityValidator.validate_input()          sync  ~1ms
      │
  [2] RetrieverAgent.retrieve()                   async ~15s / <1ms cache
      │
  [3] ProposerAgent.analyze()                     async ~5s   Llama-4-Scout
      │
  [4] AdversaryAAgent.challenge()  ─┐             async ~10s  DeepSeek R1
  [5] AdversaryBAgent.audit()       ┤ parallel    async ~10s  Qwen 32B
  [6] NILLayer.run()               ─┘             async ~0.1s VADER+cosine
      │
  [7] JudgeAgent.judge()                          async ~8s   DeepSeek Chat
      │
  [8] SecurityValidator.validate_output()          sync  ~1ms
      │
  ACHPOutput (exact format)

═══════════════════════════════════════════════════════════════════
EXACT METRIC FORMULAS
═══════════════════════════════════════════════════════════════════

  CTS  =  0.40·factual_score_A  +  0.35·judge_CTS_raw      [Consensus Truth]
         +  0.15·(1 − BIS)  +  0.10·EPS

  PCS  =  0.50·pcs_llm_B  +  0.30·nil_pcs               [Perspective Complete]
         +  0.20·(missing_per  > 0 ? 1−missing_per/10 : 1)

  BIS  =  0.55·nil_bis  +  0.25·framing_score            [Bias Impact]
         +  0.12·polarity_abs  +  framing_boost(0/0.05/0.15)

  NSS  =  0.40·(1−framing_score)  +  0.35·narrative_alignment  [Narrative Stance]
         +  0.25·judge_NSS_raw

  EPS  =  0.70·vader_eps  +  0.20·(1−framing_score)      [Epistemic Position]
         +  0.10·hedge_ratio×3

  composite  =  (CTS + PCS + (1−BIS) + NSS + EPS) / 5

═══════════════════════════════════════════════════════════════════
FINAL OUTPUT FORMAT (exact)
═══════════════════════════════════════════════════════════════════

{
  "run_id":               "abc12345",
  "timestamp":            "2026-04-06T17:30:00Z",
  "input":                "original claim text",
  "verdict":              "MOSTLY_TRUE",
  "verdict_confidence":   0.82,
  "composite_score":      0.76,
  "metrics": {
    "CTS": 0.78,   // Consensus Truth Score
    "PCS": 0.80,   // Perspective Completeness Score
    "BIS": 0.15,   // Bias Impact Score (lower = less bias)
    "NSS": 0.82,   // Narrative Stance Score
    "EPS": 0.85    // Epistemic Position Score
  },
  "nil": {
    "verdict":     "neutral",
    "confidence":  0.18,
    "summary":     "..."
  },
  "atomic_claims": [...],
  "adversary_a": { "factual_score": 0.78, "critical_flaws": [...] },
  "adversary_b": { "perspective_score": 0.80, "missing_perspectives": [...] },
  "consensus_reasoning":  "...",
  "key_evidence": {
    "supporting":     [...],
    "contradicting":  [...]
  },
  "caveats":       [...],
  "debate_rounds": 1,
  "pipeline": {
    "mode":     "full",
    "latency_ms": { ... },
    "models":   { ... },
    "cache_hit": false
  },
  "security": {
    "pre_safe":    true,
    "post_safe":   true,
    "warnings":    []
  }
}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Protocol

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Exact Metric Formulas
# ─────────────────────────────────────────────────────────────────────────────

def compute_CTS(
    factual_score_a: float,   # AdversaryA.overall_factual_score
    judge_cts_raw:  float,    # Judge raw CTS (0-1)
    bis:            float,    # computed BIS
    eps:            float,    # computed EPS
) -> float:
    """CTS = 0.40·factual_A + 0.35·judge_CTS + 0.15·(1−BIS) + 0.10·EPS"""
    return round(min(1.0, max(0.0,
        0.40 * factual_score_a +
        0.35 * judge_cts_raw   +
        0.15 * (1.0 - bis)     +
        0.10 * eps
    )), 4)


def compute_PCS(
    pcs_llm_b:    float,   # AdversaryB.perspective_completeness_score
    nil_pcs:      float,   # NIL PCS (from synthesizer)
    missing_n:    int,     # number of missing perspectives found
) -> float:
    """PCS = 0.50·pcs_B + 0.30·nil_pcs + 0.20·(1 − min(missing/10, 1))"""
    missing_penalty = min(1.0, missing_n / 10)
    return round(min(1.0, max(0.0,
        0.50 * pcs_llm_b          +
        0.30 * nil_pcs             +
        0.20 * (1.0 - missing_penalty)
    )), 4)


def compute_BIS(
    nil_bis:        float,   # NIL BiasDeepSeek BIS
    framing_score:  float,   # NIL FramingCosine framing_score
    polarity_abs:   float,   # |VADER compound|
    dominant_frame: str,     # e.g. "delegitimize"
) -> float:
    """BIS = 0.55·nil_bis + 0.25·framing + 0.12·polarity + boost"""
    boost = 0.15 if dominant_frame in ("delegitimize","conspiracy") else \
            0.05 if dominant_frame in ("alarm",) else 0.0
    return round(min(1.0, max(0.0,
        0.55 * nil_bis      +
        0.25 * framing_score +
        0.12 * polarity_abs  +
        boost
    )), 4)


def compute_NSS(
    framing_score:       float,   # NIL framing_score
    narrative_alignment: float,   # Judge raw NSS
    judge_nss_raw:       float,   # from Judge metrics
) -> float:
    """NSS = 0.40·(1−framing) + 0.35·alignment + 0.25·judge_NSS"""
    return round(min(1.0, max(0.0,
        0.40 * (1.0 - framing_score)   +
        0.35 * narrative_alignment      +
        0.25 * judge_nss_raw
    )), 4)


def compute_EPS(
    vader_eps:     float,   # SentimentEPS.EPS
    framing_score: float,   # NIL framing_score
    hedge_ratio:   float,   # from VADER analysis
) -> float:
    """EPS = 0.70·vader_eps + 0.20·(1−framing) + 0.10·min(hedge_ratio×3, 1)"""
    return round(min(1.0, max(0.0,
        0.70 * vader_eps              +
        0.20 * (1.0 - framing_score)   +
        0.10 * min(1.0, hedge_ratio * 3)
    )), 4)


def compute_composite(CTS: float, PCS: float, BIS: float, NSS: float, EPS: float) -> float:
    """composite = (CTS + PCS + (1−BIS) + NSS + EPS) / 5"""
    return round((CTS + PCS + (1.0 - BIS) + NSS + EPS) / 5, 4)


def verdict_from_composite(composite: float, judge_verdict: str) -> tuple[str, float]:
    """
    Trust the Judge verdict primarily, use composite to calibrate confidence.
    Returns (verdict_string, confidence_float).
    """
    SCALE = [
        (0.85, "TRUE"),
        (0.70, "MOSTLY_TRUE"),
        (0.50, "MIXED"),
        (0.30, "MOSTLY_FALSE"),
        (0.00, "FALSE"),
    ]
    # If judge returned UNVERIFIABLE, trust it
    if judge_verdict == "UNVERIFIABLE":
        return "UNVERIFIABLE", max(0.5, composite)
    # Otherwise blend judge with composite
    composite_verdict = "FALSE"
    for threshold, label in SCALE:
        if composite >= threshold:
            composite_verdict = label
            break
    # If both agree, high confidence
    if composite_verdict == judge_verdict:
        confidence = min(0.98, composite + 0.08)
    else:
        # Partial agreement — average the two signals
        confidence = max(0.45, composite)
    return judge_verdict, round(confidence, 4)


# ─────────────────────────────────────────────────────────────────────────────
# Offline Mocks (no API keys needed)
# ─────────────────────────────────────────────────────────────────────────────

_MOCK_EVIDENCE: Dict[str, Dict] = {
    "climate_hoax": {
        "factual_score": 0.05,
        "critical_flaws": [
            "Contradicted by 97% scientific consensus (NASA, NOAA, IPCC)",
            "China is one of the largest investors in renewable energy",
            "Temperature records pre-date Chinese involvement in climate policy",
        ],
        "verdict": "FALSE",
        "judge_cts": 0.05,
        "judge_nss": 0.20,
        "pcs_b": 0.65,
        "missing_perspectives": [
            {"stakeholder": "Climate scientists", "viewpoint": "99.9% reject hoax claim", "significance": 0.95},
            {"stakeholder": "Affected coastal communities", "viewpoint": "Experiencing measurable sea rise", "significance": 0.90},
        ],
        "consensus_reasoning": "Scientific consensus overwhelmingly refutes climate change denial. The claim that climate change is a Chinese hoax is contradicted by decades of independent atmospheric measurements, ice core data, and satellite records from agencies worldwide including NASA, ESA, and NOAA.",
        "supporting": ["IPCC AR6 report confirms 1.1°C warming above pre-industrial levels"],
        "contradicting": [
            "97.1% of peer-reviewed climate papers confirm anthropogenic warming (Cook et al.)",
            "Temperature records show consistent rise from 1880, pre-dating any alleged Chinese influence",
            "China has committed $750B to clean energy — opposite of suppressing climate awareness",
        ],
        "caveats": ["The precise attribution of climate events to human activity carries inherent uncertainty ranges"],
    },
    "exercise_heart": {
        "factual_score": 0.88,
        "critical_flaws": ["Some studies suggest benefits may be up to 35%, not exactly 30-40%"],
        "verdict": "MOSTLY_TRUE",
        "judge_cts": 0.85,
        "judge_nss": 0.82,
        "pcs_b": 0.78,
        "missing_perspectives": [
            {"stakeholder": "Cardiologists", "viewpoint": "Benefits depend on exercise type and intensity", "significance": 0.75},
        ],
        "consensus_reasoning": "Multiple meta-analyses confirm that regular moderate exercise reduces cardiovascular disease risk by approximately 30-35%. The 30-40% range cited is consistent with most major studies, though exact figures vary by population and exercise type.",
        "supporting": [
            "AHA recommends 150 min/week moderate exercise; adherents show 30-35% CVD reduction",
            "Framingham Heart Study: active individuals 28-35% lower heart disease risk",
        ],
        "contradicting": ["Effect size varies significantly by age, genetics, and baseline fitness"],
        "caveats": ["The 30-40% reduction applies to moderate intensity exercise; high-intensity may carry different risk profiles for some populations"],
    },
    "immigration_economy": {
        "factual_score": 0.15,
        "critical_flaws": [
            "Economic research shows net positive fiscal contribution from immigrants",
            "Lump-of-labour fallacy: new workers also create new jobs as consumers",
            "Uses emotionally loaded language (destroying) without evidence",
        ],
        "verdict": "MOSTLY_FALSE",
        "judge_cts": 0.20,
        "judge_nss": 0.25,
        "pcs_b": 0.30,
        "missing_perspectives": [
            {"stakeholder": "Immigrants", "viewpoint": "Research shows positive fiscal contribution", "significance": 0.95},
            {"stakeholder": "Economists", "viewpoint": "Net positive GDP impact in most OECD countries", "significance": 0.90},
            {"stakeholder": "Small business owners", "viewpoint": "Immigrant entrepreneurs create jobs", "significance": 0.80},
            {"stakeholder": "Native workers in non-competing sectors", "viewpoint": "Complementary labour dynamic", "significance": 0.70},
        ],
        "consensus_reasoning": "Economic consensus contradicts the claim's framing. IMF, World Bank, and national studies consistently show immigrants contribute net positive fiscal value over time. The 'taking jobs' claim ignores the demand-side effect where immigrants also create new economic demand.",
        "supporting": ["Some studies show wage suppression in specific low-skill sectors during high immigration periods"],
        "contradicting": [
            "CBO reports immigrants add $1.7T to US GDP over 10 years",
            "NAS study: immigrants pay more in taxes than they receive in benefits over lifetime",
            "Immigrant entrepreneurship rate is 80% higher than native-born in the US",
        ],
        "caveats": [
            "Short-term localized wage effects in specific sectors are documented but are distinct from the claim",
            "The word 'all' in the claim is demonstrably false — job creation and destruction is distributed",
        ],
    },
}


async def _mock_retriever(query: str) -> List[str]:
    """Offline context synthesis — no API needed."""
    q = query.lower()
    if "climate" in q and ("hoax" in q or "chinese" in q):
        return [
            "NASA: Global average temperatures have risen ~1.1°C since 1880.",
            "IPCC AR6: Human influence is the dominant cause of observed warming since mid-20th century.",
            "China's renewable energy investment: $750 billion committed (IEA 2023).",
            "9,136 authors from 195 countries contributed to latest IPCC report.",
        ]
    elif "exercise" in q or "cardiovascular" in q or "heart" in q:
        return [
            "AHA Guidelines: 150 min/week moderate exercise reduces CVD risk ~30-35% (Circulation, 2021).",
            "Framingham Heart Study: physically active participants had 28-35% lower cardiac event risk.",
            "Meta-analysis (Lancet, 2020): 30,000 participants, 30% CVD risk reduction with regular exercise.",
        ]
    elif "immigr" in q:
        return [
            "CBO 2024: Immigrants projected to add $1.7 trillion to US GDP over a decade.",
            "NAS Report (2016): Immigrants fiscal net positive over 75-year horizon.",
            "NBER: 44% of Fortune 500 companies founded by immigrants or their children.",
            "IMF Working Paper: Immigration has small positive effects on average wages in receiving economies.",
        ]
    return ["No specific context retrieved for this query. General knowledge will be applied."]


def _mock_proposer(query: str, context: List[str]) -> Dict:
    """Decompose query into atomic claims without LLM."""
    q = query.strip()
    if "hoax" in q.lower() or "chinese" in q.lower():
        return {
            "atomic_claims": [
                {"id":"C1","text":"Climate change is a hoax","verifiable":True,"confidence":0.1,
                 "epistemic_marker":"claims","citations":[]},
                {"id":"C2","text":"Climate change was created by China","verifiable":True,"confidence":0.05,
                 "epistemic_marker":"claims","citations":[]},
            ],
            "claim_type": "factual",
            "overall_confidence": 0.08,
        }
    elif "exercise" in q.lower():
        return {
            "atomic_claims": [
                {"id":"C1","text":"Regular exercise reduces heart disease risk","verifiable":True,"confidence":0.90,
                 "epistemic_marker":"suggests","citations":["AHA Guidelines 2021"]},
                {"id":"C2","text":"Risk reduction is 30-40%","verifiable":True,"confidence":0.80,
                 "epistemic_marker":"suggests","citations":[]},
            ],
            "claim_type": "factual",
            "overall_confidence": 0.85,
        }
    else:
        return {
            "atomic_claims": [
                {"id":"C1","text":"Immigrants are harming the economy","verifiable":True,"confidence":0.15,
                 "epistemic_marker":"claims","citations":[]},
                {"id":"C2","text":"Immigrants are taking all the jobs","verifiable":True,"confidence":0.10,
                 "epistemic_marker":"claims","citations":[]},
            ],
            "claim_type": "mixed",
            "overall_confidence": 0.12,
        }


def _select_mock(query: str) -> Dict:
    q = query.lower()
    if "climate" in q or "hoax" in q or "chinese" in q:
        return _MOCK_EVIDENCE["climate_hoax"]
    elif "exercise" in q or "heart" in q or "cardiovascular" in q:
        return _MOCK_EVIDENCE["exercise_heart"]
    else:
        return _MOCK_EVIDENCE["immigration_economy"]


# ─────────────────────────────────────────────────────────────────────────────
# ACHP Output Schema (exact)
# ─────────────────────────────────────────────────────────────────────────────

class ACHPOutput(BaseModel):
    run_id:             str
    timestamp:          str
    input:              str
    verdict:            str
    verdict_confidence: float = Field(ge=0.0, le=1.0)
    composite_score:    float = Field(ge=0.0, le=1.0)
    metrics: Dict[str, float]      # CTS, PCS, BIS, NSS, EPS
    nil: Dict[str, Any]
    atomic_claims: List[Dict[str, Any]]
    adversary_a: Dict[str, Any]
    adversary_b: Dict[str, Any]
    consensus_reasoning: str
    key_evidence: Dict[str, List[str]]  # supporting, contradicting
    caveats:      List[str]
    debate_rounds: int
    pipeline: Dict[str, Any]    # mode, latency_ms, models, cache_hit
    security: Dict[str, Any]    # pre_safe, post_safe, warnings


# ─────────────────────────────────────────────────────────────────────────────
# Core Pipeline
# ─────────────────────────────────────────────────────────────────────────────

class CorePipeline:
    """
    Wired end-to-end ACHP pipeline.

    Modes:
        offline=True   — uses fast mocks for all LLM agents (default, no API keys)
        offline=False  — uses real agents (requires GROQ_API_KEY + OPENROUTER_API_KEY)
    """

    JUDGE_CONFIDENCE_THRESHOLD = 0.70
    MAX_DEBATE_ROUNDS          = 2

    def __init__(self, offline: bool = True):
        self.offline = offline
        self._agents_loaded = False

        # Real agent instances (lazy-loaded when offline=False)
        self._retriever   = None
        self._proposer    = None
        self._adversary_a = None
        self._adversary_b = None
        self._nil         = None
        self._judge       = None
        self._security    = None

        logger.info(f"CorePipeline init | offline={offline}")

    # ── Agent Loading ──────────────────────────────────────────────────────

    def _load_real_agents(self):
        if self._agents_loaded:
            return
        from achp.agents.security_validator import SecurityValidatorAgent
        from achp.agents.retriever          import RetrieverAgent
        from achp.agents.proposer           import ProposerAgent
        from achp.agents.adversary_a        import AdversaryAAgent
        from achp.agents.adversary_b        import AdversaryBAgent
        from achp.nil.nil_layer             import NILLayer
        from achp.agents.judge              import JudgeAgent

        self._security    = SecurityValidatorAgent()
        self._retriever   = RetrieverAgent()
        self._proposer    = ProposerAgent()
        self._adversary_a = AdversaryAAgent()
        self._adversary_b = AdversaryBAgent()
        self._nil         = NILLayer()
        self._judge       = JudgeAgent()
        self._agents_loaded = True
        logger.info("All 7 real agents loaded")

    def _get_security(self):
        """Security validator always available (no LLM dependency)."""
        if self._security is None:
            from achp.agents.security_validator import SecurityValidatorAgent
            self._security = SecurityValidatorAgent()
        return self._security

    def _get_nil(self):
        """NIL layer always available (uses local embeddings)."""
        if self._nil is None:
            from achp.nil.nil_layer import NILLayer
            self._nil = NILLayer(
                use_groq_llm=not self.offline,
                use_openrouter=not self.offline,
            )
        return self._nil

    # ── Planning Mode ─────────────────────────────────────────────────────

    def _plan(self, text: str) -> str:
        """
        Lightweight internal planning: decide pipeline mode.
        Simple factual question → fast (skip full debate).
        Default → full.
        """
        words = text.lower().split()
        if len(words) < 8 and any(w in text.lower() for w in ["what is","when did","who is","define"]):
            return "fast"
        return "full"

    # ── Main Entry Point ──────────────────────────────────────────────────

    async def run(
        self,
        text: str,
        sse_queue: Optional[asyncio.Queue] = None,
        extra_context: Optional[List[str]] = None,
    ) -> ACHPOutput:
        """Run the full ACHP pipeline. Returns ACHPOutput."""
        run_id    = uuid.uuid4().hex[:8]
        t_start   = time.perf_counter()
        latencies: Dict[str, float] = {}
        models:    Dict[str, str]   = {}
        warnings:  List[str]        = []

        async def emit(event: str, data: Dict):
            if sse_queue:
                await sse_queue.put({"event": event, "data": data, "ts": time.time()})

        mode = self._plan(text)

        # ── 1. Security Pre-check ────────────────────────────────────────
        await emit("agent_status", {"agent":"security_validator","status":"running","step":1})
        t0 = time.perf_counter()
        sv   = self._get_security()
        pre  = sv.validate_input(text)
        latencies["security_pre"] = (time.perf_counter() - t0) * 1000
        warnings.extend(pre.warnings)

        if not pre.safe:
            logger.warning(f"[{run_id}] BLOCKED: {pre.block_reason}")
            return self._blocked(run_id, text, pre.block_reason or "Security pre-check failed")
        await emit("agent_status", {"agent":"security_validator","status":"done"})

        # ── 2. Retriever ─────────────────────────────────────────────────
        await emit("agent_status", {"agent":"retriever","status":"running","step":2})
        t0 = time.perf_counter()
        cache_hit = False
        if self.offline:
            retrieved_docs = await _mock_retriever(text)
            models["retriever"] = "mock"
        else:
            self._load_real_agents()
            result = await self._retriever.retrieve(text)
            retrieved_docs = [d.content if hasattr(d,"content") else d["content"]
                              for d in (result.docs or [])]
            cache_hit = result.from_cache
            models["retriever"] = "onyx-rag+bm25"
        latencies["retriever"] = (time.perf_counter() - t0) * 1000
        await emit("agent_status", {"agent":"retriever","status":"done","from_cache":cache_hit})

        # ── 3. Proposer ──────────────────────────────────────────────────
        await emit("agent_status", {"agent":"proposer","status":"running","step":3})
        t0 = time.perf_counter()
        if self.offline:
            prop_out = _mock_proposer(text, retrieved_docs)
            models["proposer"] = "mock"
        else:
            # Merge KB chunks (extra_context) BEFORE retriever docs so Proposer
            # sees [CHUNK N] markers in its {context} slot for kb_page attribution
            merged_context = list(extra_context or []) + list(retrieved_docs or [])
            prop_result = await self._proposer.analyze(text, merged_context)
            prop_out = {
                "atomic_claims":      [c.model_dump() for c in prop_result.atomic_claims],
                "claim_type":         prop_result.claim_type,
                "overall_confidence": prop_result.overall_confidence,
            }
            models["proposer"] = prop_result.model_used
        latencies["proposer"] = (time.perf_counter() - t0) * 1000
        await emit("agent_status", {
            "agent":"proposer","status":"done",
            "claim_type": prop_out["claim_type"],
            "num_claims": len(prop_out["atomic_claims"]),
        })

        # ── 4+5+6. Adversary A + B + NIL in parallel ─────────────────────
        await emit("agent_status", {"agent":"adversary_a","status":"running","step":4})
        await emit("agent_status", {"agent":"adversary_b","status":"running","step":5})
        await emit("agent_status", {"agent":"nil_supervisor","status":"running","step":6})

        t0 = time.perf_counter()
        mock = _select_mock(text) if self.offline else None

        adv_a_coro = self._run_adversary_a(text, prop_out, mock)
        adv_b_coro = self._run_adversary_b(text, prop_out, mock)
        nil_coro   = self._get_nil().run(text)

        adv_a_out, adv_b_out, nil_result = await asyncio.gather(
            adv_a_coro, adv_b_coro, nil_coro
        )
        latencies["debate_nil_parallel"] = (time.perf_counter() - t0) * 1000
        models["adversary_a"] = "mock" if self.offline else "deepseek/deepseek-r1"
        models["adversary_b"] = "mock" if self.offline else "qwen/qwen-32b"
        models["nil"]         = "vader+all-MiniLM-L6-v2"

        await emit("agent_status", {"agent":"adversary_a","status":"done",
                                    "factual_score": adv_a_out["factual_score"]})
        await emit("agent_status", {"agent":"adversary_b","status":"done",
                                    "pcs": adv_b_out["perspective_score"]})
        await emit("agent_status", {"agent":"nil_supervisor","status":"done",
                                    "nil_verdict": nil_result.nil_verdict})

        # ── Compute ACHP Metrics ─────────────────────────────────────────
        nil_s    = nil_result.sentiment.data
        nil_f    = nil_result.framing.data

        framing_sc    = nil_result.framing_score
        dominant_frame= nil_f.get("dominant_frame", "neutral")
        polarity_abs  = abs(nil_s.get("polarity", 0.0))
        hedge_ratio   = nil_s.get("hedge_ratio", 0.0)
        vader_eps     = nil_s.get("EPS", 0.5)

        # ── Adversary Override: when factual_score is very low (<0.20),
        # the claim was strongly refuted. We cannot trust VADER-only NIL
        # framing score — Adversary A's evidence is more authoritative.
        # Boost BIS / override nil_verdict accordingly.
        factual_score_a = adv_a_out["factual_score"]
        if factual_score_a < 0.20:
            # Strong refutation: treat as misleading regardless of VADER score
            nil_result.nil_verdict   = "misleading"
            nil_result.nil_confidence = max(nil_result.nil_confidence, 0.46)
            nil_result.BIS           = max(nil_result.BIS, 0.30)
            framing_sc               = max(framing_sc, 0.15)
            dominant_frame           = dominant_frame if dominant_frame != "neutral" else "alarm"

        # ── 7. Judge ─────────────────────────────────────────────────────
        await emit("agent_status", {"agent":"judge","status":"running","step":7})
        t0 = time.perf_counter()
        debate_round = 1

        judge_out = await self._run_judge(
            text, prop_out, adv_a_out, adv_b_out, nil_result, mock
        )
        models["judge"] = "mock" if self.offline else "deepseek/deepseek-chat"

        # Conditional re-debate if judge confidence low
        while (judge_out["verdict_confidence"] < self.JUDGE_CONFIDENCE_THRESHOLD
               and debate_round < self.MAX_DEBATE_ROUNDS):
            debate_round += 1
            await emit("agent_status", {"agent":"judge","status":"re_debating","round":debate_round})
            logger.info(f"[{run_id}] Low Judge confidence ({judge_out['verdict_confidence']:.2f}), re-debating")
            if not self.offline:
                adv_a_out_new = await self._run_adversary_a(text, prop_out, None, debate_round)
                judge_out = await self._run_judge(text, prop_out, adv_a_out_new, adv_b_out, nil_result, None)
            else:
                break   # can't improve in offline mode

        latencies["judge"] = (time.perf_counter() - t0) * 1000
        await emit("agent_status", {"agent":"judge","status":"done","verdict":judge_out["verdict"]})

        # ── Compute final ACHP metrics ────────────────────────────────────
        BIS = compute_BIS(nil_result.BIS, framing_sc, polarity_abs, dominant_frame)
        EPS = compute_EPS(vader_eps, framing_sc, hedge_ratio)
        CTS = compute_CTS(adv_a_out["factual_score"], judge_out.get("cts_raw", 0.5), BIS, EPS)
        PCS = compute_PCS(
            adv_b_out["perspective_score"],
            nil_result.PCS,
            len(adv_b_out.get("missing_perspectives", [])),
        )
        NSS = compute_NSS(
            framing_sc,
            1.0 - framing_sc,             # simpler alignment proxy
            judge_out.get("nss_raw", NSS_proxy(BIS, framing_sc)),
        )
        composite = compute_composite(CTS, PCS, BIS, NSS, EPS)
        verdict, confidence = verdict_from_composite(composite, judge_out["verdict"])

        # ── 8. Security Post-check ────────────────────────────────────────
        t0 = time.perf_counter()
        post = sv.validate_output(judge_out.get("reasoning", ""))
        latencies["security_post"] = (time.perf_counter() - t0) * 1000
        warnings.extend(post.warnings)

        total_latency = (time.perf_counter() - t_start) * 1000

        # ── Assemble ACHPOutput ───────────────────────────────────────────
        output = ACHPOutput(
            run_id=run_id,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            input=text,
            verdict=verdict,
            verdict_confidence=confidence,
            composite_score=composite,
            metrics={"CTS": CTS, "PCS": PCS, "BIS": BIS, "NSS": NSS, "EPS": EPS},
            nil={
                "verdict":    nil_result.nil_verdict,
                "confidence": nil_result.nil_confidence,
                "summary":    nil_result.nil_summary,
                "BIS":        nil_result.BIS,
                "EPS":        nil_result.EPS,
                "PCS":        nil_result.PCS,
            },
            atomic_claims=prop_out["atomic_claims"],
            adversary_a={
                "factual_score":  adv_a_out["factual_score"],
                "critical_flaws": adv_a_out.get("critical_flaws", []),
                "verdict":        adv_a_out.get("verdict", "contested"),
            },
            adversary_b={
                "perspective_score":   adv_b_out["perspective_score"],
                "missing_perspectives": adv_b_out.get("missing_perspectives", []),
                "narrative_stance":    adv_b_out.get("narrative_stance","unknown"),
            },
            consensus_reasoning=judge_out.get("reasoning", ""),
            key_evidence={
                "supporting":    judge_out.get("supporting", []),
                "contradicting": judge_out.get("contradicting", []),
            },
            caveats=judge_out.get("caveats", []),
            debate_rounds=debate_round,
            pipeline={
                "mode":       mode,
                "latency_ms": {k: round(v, 2) for k, v in latencies.items()},
                "total_ms":   round(total_latency, 2),
                "models":     models,
                "cache_hit":  cache_hit,
            },
            security={
                "pre_safe":  pre.safe,
                "post_safe": post.safe,
                "warnings":  warnings,
            },
        )

        await emit("pipeline_complete", {
            "run_id":    run_id,
            "verdict":   verdict,
            "composite": composite,
            "latency_ms": total_latency,
        })

        logger.info(
            f"[{run_id}] DONE | {verdict} ({confidence:.0%}) | "
            f"CTS={CTS:.2f} PCS={PCS:.2f} BIS={BIS:.2f} NSS={NSS:.2f} EPS={EPS:.2f} | "
            f"{total_latency:.0f}ms | rounds={debate_round}"
        )
        return output

    # ── Private helpers ────────────────────────────────────────────────────

    async def _run_adversary_a(self, text, prop_out, mock, round_n=1) -> Dict:
        if self.offline and mock:
            return {
                "factual_score":  mock["factual_score"],
                "critical_flaws": mock["critical_flaws"],
                "verdict":        "refuted" if mock["factual_score"] < 0.3 else "contested",
            }
        # Real mode
        from achp.agents.adversary_a import AdversaryAAgent
        from achp.agents.proposer import ClaimAnalysis, AtomicClaim
        if self._adversary_a is None:
            self._adversary_a = AdversaryAAgent()
        # Reconstruct ClaimAnalysis from prop_out dict
        analysis = _dict_to_analysis(text, prop_out)
        report = await self._adversary_a.challenge(analysis, debate_round=round_n)
        return {
            "factual_score":  report.overall_factual_score,
            "critical_flaws": report.critical_flaws,
            "verdict":        "refuted" if report.overall_factual_score < 0.3 else "contested",
        }

    async def _run_adversary_b(self, text, prop_out, mock) -> Dict:
        if self.offline and mock:
            return {
                "perspective_score":   mock["pcs_b"],
                "missing_perspectives": mock.get("missing_perspectives", []),
                "narrative_stance":    "skewed" if mock["pcs_b"] < 0.5 else "partial",
            }
        from achp.agents.adversary_b import AdversaryBAgent
        if self._adversary_b is None:
            self._adversary_b = AdversaryBAgent()
        analysis = _dict_to_analysis(text, prop_out)
        report = await self._adversary_b.audit(analysis)
        return {
            "perspective_score":   report.perspective_completeness_score,
            "missing_perspectives": [p.model_dump() for p in report.missing_perspectives],
            "narrative_stance":    report.narrative_stance,
        }

    async def _run_judge(self, text, prop_out, adv_a, adv_b, nil_result, mock) -> Dict:
        if self.offline and mock:
            v = mock["verdict"]
            cts_raw = mock["judge_cts"]
            return {
                "verdict":            v,
                "verdict_confidence": 0.90 if cts_raw > 0.7 else 0.70,
                "cts_raw":            cts_raw,
                "nss_raw":            mock["judge_nss"],
                "reasoning":          mock["consensus_reasoning"],
                "supporting":         mock["supporting"],
                "contradicting":      mock["contradicting"],
                "caveats":            mock["caveats"],
            }
        from achp.agents.judge import JudgeAgent
        from achp.agents.adversary_a import AdversaryAReport, ClaimChallenge
        from achp.agents.adversary_b import NarrativeAuditReport, MissingPerspective
        from achp.agents.nil_supervisor import NILReport
        if self._judge is None:
            self._judge = JudgeAgent()
        analysis = _dict_to_analysis(text, prop_out)
        # Build minimal AdversaryAReport
        adv_a_report = _dict_to_adv_a_report(adv_a)
        adv_b_report = _dict_to_adv_b_report(adv_b)
        # Use nil_supervisor NILReport format
        nil_sup_report = _nil_result_to_supervisor(nil_result)
        verdict = await self._judge.judge(analysis, adv_a_report, adv_b_report, nil_sup_report)
        return {
            "verdict":            verdict.verdict,
            "verdict_confidence": verdict.verdict_confidence,
            "cts_raw":            verdict.metrics.CTS,
            "nss_raw":            verdict.metrics.NSS,
            "reasoning":          verdict.consensus_reasoning,
            "supporting":         verdict.key_supporting_evidence,
            "contradicting":      verdict.key_contradicting_evidence,
            "caveats":            verdict.important_caveats,
        }

    def _blocked(self, run_id: str, text: str, reason: str) -> ACHPOutput:
        z = {"CTS":0.0,"PCS":0.0,"BIS":1.0,"NSS":0.0,"EPS":0.0}
        return ACHPOutput(
            run_id=run_id, timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
            input=text, verdict="BLOCKED", verdict_confidence=1.0, composite_score=0.0,
            metrics=z,
            nil={"verdict":"blocked","confidence":0.0,"summary":""},
            atomic_claims=[], adversary_a={}, adversary_b={},
            consensus_reasoning=f"BLOCKED: {reason}",
            key_evidence={"supporting":[],"contradicting":[]},
            caveats=[reason], debate_rounds=0,
            pipeline={"mode":"blocked","latency_ms":{},"total_ms":0,"models":{},"cache_hit":False},
            security={"pre_safe":False,"post_safe":True,"warnings":[reason]},
        )

    async def run_stream(self, text: str) -> AsyncGenerator[Dict, None]:
        q = asyncio.Queue()
        sentinel = object()
        async def _run():
            await self.run(text, sse_queue=q)
            await q.put(sentinel)
        asyncio.create_task(_run())
        while True:
            ev = await q.get()
            if ev is sentinel:
                break
            yield ev


# ─────────────────────────────────────────────────────────────────────────────
# Conversion helpers
# ─────────────────────────────────────────────────────────────────────────────

def NSS_proxy(bis: float, framing: float) -> float:
    """NSS proxy when Judge doesn't return NSS."""
    return round(max(0.0, 1.0 - 0.6*bis - 0.4*framing), 4)


def _dict_to_analysis(text: str, prop_out: Dict):
    try:
        from achp.agents.proposer import ClaimAnalysis, AtomicClaim
        return ClaimAnalysis(
            original_input=text,
            atomic_claims=[AtomicClaim(**c) for c in prop_out.get("atomic_claims",[])],
            overall_confidence=prop_out.get("overall_confidence",0.5),
            claim_type=prop_out.get("claim_type","mixed"),
            context_summary=text[:100],
            retrieved_context=[],
            model_used="mock",
        )
    except Exception:
        return None


def _dict_to_adv_a_report(adv_a: Dict):
    try:
        from achp.agents.adversary_a import AdversaryAReport
        return AdversaryAReport(
            challenges=[],
            overall_factual_score=adv_a.get("factual_score",0.5),
            critical_flaws=adv_a.get("critical_flaws",[]),
            model_used="mock",
        )
    except Exception:
        return None


def _dict_to_adv_b_report(adv_b: Dict):
    try:
        from achp.agents.adversary_b import NarrativeAuditReport
        return NarrativeAuditReport(
            missing_perspectives=[],
            represented_stakeholders=[],
            framing_asymmetries=[],
            silenced_voices=[],
            perspective_completeness_score=adv_b.get("perspective_score",0.5),
            narrative_stance=adv_b.get("narrative_stance","balanced"),
            model_used="mock",
        )
    except Exception:
        return None


def _nil_result_to_supervisor(nil_result):
    try:
        from achp.agents.nil_supervisor import NILReport
        return NILReport(
            nil_verdict=nil_result.nil_verdict,
            nil_confidence=nil_result.nil_confidence,
            nil_summary=nil_result.nil_summary,
            sentiment=nil_result.sentiment.data,
            bias=nil_result.bias.data,
            perspectives=nil_result.perspective.data,
            framing=nil_result.framing.data,
        )
    except Exception:
        return None

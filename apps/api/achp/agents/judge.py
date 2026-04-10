"""
ACHP — Judge Agent (LLM Council Consensus)
==========================================
Primary: Groq (llama-3.3-70b-versatile or env: JUDGE_MODEL).
Fallback: Groq llama-3.3-70b-versatile (JUDGE_FALLBACK_MODEL).

Switched from OpenRouter to Groq since OR requires paid credits.
Tenacity retries only on 5xx / transient errors, NOT on 4xx.

Metrics computed:
  BIS — Bias Impact Score        [0-1, 1=high bias]
  PCS — Perspective Completeness [0-1, 1=all perspectives]
  EPS — Epistemic Position Score [0-1, 1=well-calibrated]
  NSS — Narrative Stance Score   [0-1, 1=aligns with facts]
  CTS — Consensus Truth Score    [0-1, 1=verified true]
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI, APIStatusError
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from achp.agents.proposer    import ClaimAnalysis
from achp.agents.adversary_a import AdversaryAReport
from achp.agents.adversary_b import NarrativeAuditReport
from achp.agents.nil_supervisor import NILReport

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Output Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ACHPMetrics(BaseModel):
    BIS: float = Field(ge=0.0, le=1.0, description="Bias Impact Score")
    PCS: float = Field(ge=0.0, le=1.0, description="Perspective Completeness Score")
    EPS: float = Field(ge=0.0, le=1.0, description="Epistemic Position Score")
    NSS: float = Field(ge=0.0, le=1.0, description="Narrative Stance Score")
    CTS: float = Field(ge=0.0, le=1.0, description="Consensus Truth Score")

    @property
    def composite(self) -> float:
        """Equal-weight composite ACHP score."""
        return (self.BIS + self.PCS + self.EPS + self.NSS + self.CTS) / 5


class JudgeVerdict(BaseModel):
    verdict: str       # "TRUE"|"MOSTLY_TRUE"|"MIXED"|"MOSTLY_FALSE"|"FALSE"|"UNVERIFIABLE"
    verdict_confidence: float = Field(ge=0.0, le=1.0)
    metrics: ACHPMetrics
    consensus_reasoning: str
    key_supporting_evidence: List[str] = []
    key_contradicting_evidence: List[str] = []
    important_caveats: List[str] = []
    recommended_further_reading: List[str] = []
    model_used: str = ""
    latency_ms: float = 0.0
    debate_summary: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Retry predicate — only retry on 5xx / network errors, NOT on 4xx
# ─────────────────────────────────────────────────────────────────────────────

def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, APIStatusError):
        return exc.status_code >= 500
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the Judge in the ACHP LLM Council — the final arbiter.

You receive a structured debate transcript between:
- Proposer: decomposed the claim into atomic sub-claims
- Adversary A: challenged the factual accuracy of each claim
- Adversary B: audited missing perspectives and narrative fairness
- NIL Report: automated sentiment, bias, and framing analysis

Your role: synthesize all inputs into a fair, calibrated consensus verdict.

## Scoring Guidelines:
- BIS (Bias Impact Score): How much harmful bias is present? (1=extreme bias)
- PCS (Perspective Completeness): Are all relevant perspectives included? (1=complete)
- EPS (Epistemic Position Score): Are claims appropriately hedged vs overclaimed? (1=well-calibrated)
- NSS (Narrative Stance Score): Does the narrative framing align with factual consensus? (1=aligned)
- CTS (Consensus Truth Score): Overall factual credibility after debate? (1=fully verified)

## Verdict Scale:
TRUE > 0.85 | MOSTLY_TRUE 0.70-0.85 | MIXED 0.50-0.70 | MOSTLY_FALSE 0.30-0.50 | FALSE < 0.30 | UNVERIFIABLE (insufficient evidence)

Output FORMAT (strict JSON):
{
  "verdict": "MOSTLY_TRUE",
  "verdict_confidence": 0.82,
  "metrics": {"BIS": 0.20, "PCS": 0.75, "EPS": 0.80, "NSS": 0.85, "CTS": 0.78},
  "consensus_reasoning": "detailed explanation of the verdict",
  "key_supporting_evidence": ["evidence that supports the claim"],
  "key_contradicting_evidence": ["evidence against the claim"],
  "important_caveats": ["nuances the reader should know"],
  "recommended_further_reading": ["topics to explore"],
  "debate_summary": "one-paragraph summary of the full debate"
}"""


def _build_debate_transcript(
    analysis: ClaimAnalysis,
    adversary_a: AdversaryAReport,
    adversary_b: NarrativeAuditReport,
    nil_report: NILReport,
) -> str:
    return f"""=== PROPOSER (Groq Llama 4 Scout) ===
Original claim: {analysis.original_input}
Claim type: {analysis.claim_type}
Overall confidence: {analysis.overall_confidence}
Atomic claims:
{chr(10).join(f'  [{c.id}] {c.text} (verifiable={c.verifiable})' for c in analysis.atomic_claims)}

=== ADVERSARY A — Factual Challenges ({adversary_a.model_used}) ===
Factual score: {adversary_a.overall_factual_score}
Critical flaws: {adversary_a.critical_flaws}
Per-claim verdicts: {[f'{c.claim_id}:{c.verdict}({c.confidence:.2f})' for c in adversary_a.challenges]}

=== ADVERSARY B — Narrative Audit ({adversary_b.model_used}) ===
Perspective completeness: {adversary_b.perspective_completeness_score}
Narrative stance: {adversary_b.narrative_stance}
Missing perspectives: {[p.stakeholder for p in adversary_b.missing_perspectives[:5]]}
Silenced voices: {adversary_b.silenced_voices}
Framing asymmetries: {adversary_b.framing_asymmetries}

=== NIL SUPERVISOR REPORT ===
Sentiment: {nil_report.sentiment}
Bias indicators: {nil_report.bias}
NIL verdict: {nil_report.nil_verdict} (confidence={nil_report.nil_confidence})
NIL summary: {nil_report.nil_summary}"""


# ─────────────────────────────────────────────────────────────────────────────
# Judge Agent
# ─────────────────────────────────────────────────────────────────────────────

class JudgeAgent:
    AGENT_ID = "judge"
    DEFAULT_MODEL  = "llama-3.3-70b-versatile"   # Groq primary
    FALLBACK_MODEL = "llama-3.3-70b-versatile"   # Groq fallback (same — very reliable)

    def __init__(self, model: Optional[str] = None, temperature: float = 0.1):
        self.model         = model or os.getenv("JUDGE_MODEL", self.DEFAULT_MODEL)
        self.fallback      = os.getenv("JUDGE_FALLBACK_MODEL", self.FALLBACK_MODEL)
        self.temperature   = temperature
        self._groq_client: Optional[AsyncOpenAI] = None
        logger.info(f"JudgeAgent initialized | model={self.model}")

    def _get_groq_client(self) -> AsyncOpenAI:
        if self._groq_client is None:
            self._groq_client = AsyncOpenAI(
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1",
            )
        return self._groq_client

    @staticmethod
    def _parse_raw(text: str) -> dict:
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=False,
    )
    async def _call_groq(self, messages: list, model: str) -> dict:
        client = self._get_groq_client()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=2048,
        )
        return self._parse_raw(response.choices[0].message.content)

    async def judge(
        self,
        analysis: ClaimAnalysis,
        adversary_a: AdversaryAReport,
        adversary_b: NarrativeAuditReport,
        nil_report: NILReport,
    ) -> JudgeVerdict:
        t0 = time.perf_counter()
        transcript = _build_debate_transcript(analysis, adversary_a, adversary_b, nil_report)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Debate Transcript:\n{transcript}\n\nOutput your verdict JSON:"},
        ]

        raw: Optional[dict] = None
        model_used = self.model

        # ── Try primary Groq model ────────────────────────────────────────
        try:
            raw = await self._call_groq(messages, self.model)
        except APIStatusError as e:
            logger.warning(f"Judge primary failed ({e.status_code}), falling back to {self.fallback}")
        except Exception as e:
            logger.warning(f"Judge primary error ({e}), falling back to {self.fallback}")

        # ── Groq fallback ─────────────────────────────────────────────────
        if raw is None:
            try:
                raw = await self._call_groq(messages, self.fallback)
                model_used = self.fallback
            except Exception as e:
                logger.error(f"Judge fallback also failed: {e}")
                raw = {
                    "verdict": "MIXED",
                    "verdict_confidence": 0.5,
                    "metrics": {"BIS": 0.3, "PCS": 0.5, "EPS": 0.5, "NSS": 0.5, "CTS": 0.5},
                    "consensus_reasoning": "Analysis completed with partial data; judge LLM failed.",
                    "key_supporting_evidence": [],
                    "key_contradicting_evidence": [],
                    "important_caveats": ["Judge LLM was unavailable; verdict is a default"],
                    "recommended_further_reading": [],
                    "debate_summary": "Automated judgment unavailable.",
                }

        latency = (time.perf_counter() - t0) * 1000
        metrics = ACHPMetrics(**raw["metrics"])

        verdict = JudgeVerdict(
            verdict=raw["verdict"],
            verdict_confidence=raw["verdict_confidence"],
            metrics=metrics,
            consensus_reasoning=raw.get("consensus_reasoning", ""),
            key_supporting_evidence=raw.get("key_supporting_evidence", []),
            key_contradicting_evidence=raw.get("key_contradicting_evidence", []),
            important_caveats=raw.get("important_caveats", []),
            recommended_further_reading=raw.get("recommended_further_reading", []),
            model_used=model_used,
            latency_ms=latency,
            debate_summary=raw.get("debate_summary", ""),
        )

        logger.info(
            f"JudgeAgent | verdict={verdict.verdict} | CTS={metrics.CTS:.2f} | "
            f"composite={metrics.composite:.2f} | model={model_used} | {latency:.0f}ms"
        )
        return verdict

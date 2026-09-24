"""
ACHP — Judge (logical agent "Judge"). One Groq call.

Reads the whole debate (the parts, Adversary A's per-part findings with evidence ids, Adversary
B's audit, the NIL signals) against the evidence pack, labels every part and gives the overall
verdict. Grounding then enforces evidence-first rules: a label that asserts support or
contradiction without a valid evidence id becomes "unverifiable", and a verdict with no grounded
part becomes UNVERIFIABLE. Evidence lines in the response are rendered from the pack, never from
model text.

Metrics the Judge returns are raw readings; the published CTS·PCS·BIS·NSS·EPS are computed by the
formulas in achp.core.core_pipeline (pinned by the Assay parity tests).
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from achp.agents.adversary_a import AdversaryAReport
from achp.agents.adversary_b import NarrativeAuditReport
from achp.agents.proposer import ClaimAnalysis
from achp.evidence.grounding import ground_judge
from achp.evidence.pack import EvidencePack
from achp.llm.runtime import GroqRuntime, LLMResult, get_runtime
from achp.prompts.contract import build_messages
from achp.prompts.schemas import JudgeOutput

logger = logging.getLogger(__name__)


class ACHPMetrics(BaseModel):
    BIS: float = Field(ge=0.0, le=1.0, description="Bias Impact Score")
    PCS: float = Field(ge=0.0, le=1.0, description="Perspective Completeness Score")
    EPS: float = Field(ge=0.0, le=1.0, description="Epistemic Position Score")
    NSS: float = Field(ge=0.0, le=1.0, description="Narrative Stance Score")
    CTS: float = Field(ge=0.0, le=1.0, description="Consensus Truth Score")

    @property
    def composite(self) -> float:
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
    claims: List[Dict[str, Any]] = []            # per-part {claim_id, label, evidence_for, evidence_against, missing_context}
    key_supporting_evidence_ids: List[str] = []
    key_contradicting_evidence_ids: List[str] = []
    needs_second_round: bool = False
    second_round_reason: Optional[str] = None
    public_note: str = ""


def _nil_view(nil: Any) -> Dict[str, Any]:
    if nil is None:
        return {}
    f = getattr(nil, "framing", None)
    s = getattr(nil, "sentiment", None)
    return {
        "verdict": getattr(nil, "nil_verdict", "unknown"),
        "bias_impact": getattr(nil, "BIS", None),
        "epistemic_position": getattr(nil, "EPS", None),
        "perspective_completeness": getattr(nil, "PCS", None),
        "framing_score": getattr(nil, "framing_score", None),
        "dominant_frame": (f.data if f else {}).get("dominant_frame"),
        "loaded_words": (s.data if s else {}).get("loaded_words", []),
    }


class JudgeAgent:
    AGENT_ID = "judge"

    def __init__(self, runtime: Optional[GroqRuntime] = None):
        self._runtime = runtime

    @property
    def runtime(self) -> GroqRuntime:
        return self._runtime or get_runtime()

    async def run(
        self,
        analysis: ClaimAnalysis,
        adversary_a: AdversaryAReport,
        adversary_b: NarrativeAuditReport,
        nil: Any,
        pack: EvidencePack,
        *,
        run_id: Optional[str] = None,
    ) -> tuple[JudgeVerdict, Counter, LLMResult]:
        payload = {
            "CLAIM": analysis.original_input,
            "PARTS": [{"claim_id": c.id, "text": c.text, "verifiable": c.verifiable,
                       "evidence_ids": c.evidence_ids} for c in analysis.atomic_claims],
            "EVIDENCE": pack.prompt_view(),
            "FACT_CHALLENGE": {
                "overall_factual_score": adversary_a.overall_factual_score,
                "per_part": [c.model_dump(exclude={"counter_evidence"}) for c in adversary_a.challenges],
                "critical_flaws": adversary_a.critical_flaws,
                "flaws": adversary_a.flaws,
                "round": adversary_a.debate_round,
            },
            "NARRATIVE_AUDIT": {
                "perspective_completeness": adversary_b.perspective_completeness_score,
                "narrative_stance": adversary_b.narrative_stance,
                "missing_perspectives": [m.model_dump() for m in adversary_b.missing_perspectives],
                "framing_asymmetries": adversary_b.framing_asymmetries,
                "flaws": adversary_b.flaws,
            },
            "LANGUAGE_SIGNALS": _nil_view(nil),
        }
        result = await self.runtime.complete("judge", build_messages("judge", payload), JudgeOutput, run_id=run_id)
        grounded, dropped = ground_judge(result.value, pack, [c.id for c in analysis.atomic_claims])
        m = grounded.metrics
        verdict = JudgeVerdict(
            verdict=grounded.verdict,
            verdict_confidence=grounded.verdict_confidence,
            metrics=ACHPMetrics(BIS=m.BIS, PCS=m.PCS, EPS=m.EPS, NSS=m.NSS, CTS=m.CTS),
            consensus_reasoning=grounded.consensus_reasoning,
            key_supporting_evidence=[pack.cite(e) for e in grounded.key_supporting_evidence_ids],
            key_contradicting_evidence=[pack.cite(e) for e in grounded.key_contradicting_evidence_ids],
            important_caveats=grounded.important_caveats,
            model_used=result.model,
            latency_ms=result.latency_ms,
            debate_summary=grounded.debate_summary,
            claims=[c.model_dump() for c in grounded.claims],
            key_supporting_evidence_ids=grounded.key_supporting_evidence_ids,
            key_contradicting_evidence_ids=grounded.key_contradicting_evidence_ids,
            needs_second_round=grounded.needs_second_round,
            second_round_reason=grounded.second_round_reason,
            public_note=grounded.public_note,
        )
        logger.info("Judge | %s (%.2f) | %s | %.0fms | dropped=%s", verdict.verdict,
                    verdict.verdict_confidence, result.model, result.latency_ms, dict(+dropped))
        return verdict, dropped, result

    async def judge(self, analysis: ClaimAnalysis, adversary_a: AdversaryAReport,
                    adversary_b: NarrativeAuditReport, nil_report: Any,
                    pack: Optional[EvidencePack] = None) -> JudgeVerdict:
        """Compatible entry point."""
        pack = pack or EvidencePack.build(analysis.original_input, context=analysis.retrieved_context)
        verdict, _, _ = await self.run(analysis, adversary_a, adversary_b, nil_report, pack)
        return verdict

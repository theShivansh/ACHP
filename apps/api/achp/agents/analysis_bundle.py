"""
ACHP — analysis bundle. One Groq call serves three logical agents:

  fact_challenge    → Adversary A (Fact Challenger)
  narrative_audit   → Adversary B (Narrative Auditor)
  language_signals  → the LLM half of the NIL layer (bias, epistemic quality, perspectives)

They were three to five separate calls before; they read the same claim, parts and evidence, so a
single structured call cuts Groq requests and tokens without merging their judgments: each section
has its own schema, and the sections are graded independently by grounding and by the Judge.
"""
from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from typing import Optional

from achp.agents.adversary_a import AdversaryAReport, ClaimChallenge
from achp.agents.adversary_b import MissingPerspective, NarrativeAuditReport
from achp.agents.proposer import ClaimAnalysis
from achp.evidence.grounding import ground_bundle
from achp.evidence.pack import EvidencePack
from achp.llm.runtime import GroqRuntime, LLMResult, get_runtime
from achp.prompts.contract import build_messages
from achp.prompts.schemas import AnalysisBundleOutput, LanguageSignalsOut

logger = logging.getLogger(__name__)


@dataclass
class BundleResult:
    adversary_a: AdversaryAReport
    adversary_b: NarrativeAuditReport
    signals: LanguageSignalsOut
    grounding: Counter
    llm: LLMResult


def _parts_payload(analysis: ClaimAnalysis):
    return [
        {"claim_id": c.id, "text": c.text, "verifiable": c.verifiable, "evidence_ids": c.evidence_ids}
        for c in analysis.atomic_claims
    ]


class AnalysisBundleAgent:
    AGENT_IDS = ("adversary_a", "adversary_b", "nil_supervisor")

    def __init__(self, runtime: Optional[GroqRuntime] = None):
        self._runtime = runtime

    @property
    def runtime(self) -> GroqRuntime:
        return self._runtime or get_runtime()

    async def run(
        self,
        claim: str,
        analysis: ClaimAnalysis,
        pack: EvidencePack,
        *,
        debate_round: int = 1,
        judge_question: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> BundleResult:
        payload = {
            "CLAIM": claim,
            "PARTS": _parts_payload(analysis),
            "EVIDENCE": pack.prompt_view(),
        }
        if debate_round > 1 and judge_question:
            payload["ROUND"] = debate_round
            payload["JUDGE_QUESTION"] = judge_question
        result = await self.runtime.complete(
            "analysis", build_messages("analysis", payload), AnalysisBundleOutput, run_id=run_id,
        )
        claim_texts = {c.id: c.text for c in analysis.atomic_claims}
        grounded, dropped = ground_bundle(result.value, pack, claim, claim_texts)

        fc, na = grounded.fact_challenge, grounded.narrative_audit
        adv_a = AdversaryAReport(
            challenges=[
                ClaimChallenge(
                    claim_id=c.claim_id,
                    verdict=c.verdict,
                    confidence=c.confidence,
                    counter_evidence=[pack.cite(e) for e in c.counter_evidence_ids],
                    missing_evidence=c.missing_evidence,
                    logical_fallacies=c.logical_fallacies,
                    epistemic_flags=c.epistemic_flags,
                    supporting_evidence_ids=c.supporting_evidence_ids,
                    counter_evidence_ids=c.counter_evidence_ids,
                )
                for c in fc.challenges
            ],
            overall_factual_score=fc.overall_factual_score,
            critical_flaws=[
                cf.text + (f" [{', '.join(cf.evidence_ids)}]" if cf.evidence_ids else "")
                for cf in fc.critical_flaws
            ],
            flaws=[f.model_dump() for f in fc.flaws],
            public_note=fc.public_note,
            model_used=result.model,
            latency_ms=result.latency_ms,
            debate_round=debate_round,
        )
        adv_b = NarrativeAuditReport(
            missing_perspectives=[
                MissingPerspective(stakeholder=m.stakeholder, viewpoint=m.viewpoint,
                                   why_missing=m.why_missing, significance=m.significance,
                                   evidence_ids=m.evidence_ids)
                for m in na.missing_perspectives
            ],
            represented_stakeholders=na.represented_stakeholders,
            framing_asymmetries=na.framing_asymmetries,
            silenced_voices=na.silenced_voices,
            perspective_completeness_score=na.perspective_completeness_score,
            narrative_stance=na.narrative_stance,
            flaws=[f.model_dump() for f in na.flaws],
            public_note=na.public_note,
            model_used=result.model,
            latency_ms=result.latency_ms,
        )
        logger.info(
            "AnalysisBundle | round=%d | factual=%.2f pcs=%.2f | %s | %.0fms | dropped=%s",
            debate_round, adv_a.overall_factual_score, adv_b.perspective_completeness_score,
            result.model, result.latency_ms, dict(+dropped),
        )
        return BundleResult(adv_a, adv_b, grounded.language_signals, dropped, result)

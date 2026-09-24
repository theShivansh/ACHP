"""
ACHP — Adversary A (logical agent "Fact Challenger").

Runs inside the analysis bundle (achp.agents.analysis_bundle): one Groq call serves Adversary A,
Adversary B and the NIL language signals. This module keeps Adversary A's public report model and
a compatibility wrapper for callers that only want this agent's view.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from achp.agents.proposer import ClaimAnalysis


class ClaimChallenge(BaseModel):
    claim_id: str
    verdict: str              # "supported"|"contested"|"refuted"|"unverifiable"
    confidence: float = Field(ge=0.0, le=1.0)
    counter_evidence: List[str] = []       # rendered from the evidence pack, never model text
    missing_evidence: List[str] = []
    logical_fallacies: List[str] = []
    epistemic_flags: List[str] = []
    supporting_evidence_ids: List[str] = []
    counter_evidence_ids: List[str] = []


class AdversaryAReport(BaseModel):
    challenges: List[ClaimChallenge]
    overall_factual_score: float = Field(ge=0.0, le=1.0)
    critical_flaws: List[str] = []
    flaws: List[Dict[str, Any]] = []       # {claim_id, quote, relation, evidence_ids, severity}
    public_note: str = ""
    model_used: str = ""
    latency_ms: float = 0.0
    debate_round: int = 1


class AdversaryAAgent:
    """Compatibility wrapper: runs the analysis bundle and returns Adversary A's part."""
    AGENT_ID = "adversary_a"

    def __init__(self, bundle: Optional[Any] = None):
        self._bundle = bundle

    async def challenge(self, analysis: ClaimAnalysis, debate_round: int = 1,
                        pack: Optional[Any] = None) -> AdversaryAReport:
        from achp.agents.analysis_bundle import AnalysisBundleAgent
        from achp.evidence.pack import EvidencePack
        bundle = self._bundle or AnalysisBundleAgent()
        pack = pack or EvidencePack.build(analysis.original_input, context=analysis.retrieved_context)
        result = await bundle.run(analysis.original_input, analysis, pack, debate_round=debate_round)
        return result.adversary_a

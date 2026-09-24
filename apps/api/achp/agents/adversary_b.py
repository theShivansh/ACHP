"""
ACHP — Adversary B (logical agent "Narrative Auditor").

Runs inside the analysis bundle (achp.agents.analysis_bundle). This module keeps Adversary B's
public report model and a compatibility wrapper.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from achp.agents.proposer import ClaimAnalysis


class MissingPerspective(BaseModel):
    stakeholder: str
    viewpoint: str
    why_missing: str = ""
    significance: float = Field(ge=0.0, le=1.0)
    evidence_ids: List[str] = []


class NarrativeAuditReport(BaseModel):
    missing_perspectives: List[MissingPerspective]
    represented_stakeholders: List[str]
    framing_asymmetries: List[str]
    silenced_voices: List[str]
    perspective_completeness_score: float = Field(ge=0.0, le=1.0)
    narrative_stance: str  # "balanced"|"skewed_left"|"skewed_right"|"corporate"|"populist"|"one_sided"
    flaws: List[Dict[str, Any]] = []
    public_note: str = ""
    model_used: str = ""
    latency_ms: float = 0.0


class AdversaryBAgent:
    """Compatibility wrapper: runs the analysis bundle and returns Adversary B's part."""
    AGENT_ID = "adversary_b"

    def __init__(self, bundle: Optional[Any] = None):
        self._bundle = bundle

    async def audit(self, analysis: ClaimAnalysis, pack: Optional[Any] = None) -> NarrativeAuditReport:
        from achp.agents.analysis_bundle import AnalysisBundleAgent
        from achp.evidence.pack import EvidencePack
        bundle = self._bundle or AnalysisBundleAgent()
        pack = pack or EvidencePack.build(analysis.original_input, context=analysis.retrieved_context)
        result = await bundle.run(analysis.original_input, analysis, pack)
        return result.adversary_b

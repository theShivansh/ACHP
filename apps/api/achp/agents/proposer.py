"""
ACHP — Proposer (logical agent "Decomposer"). One Groq call.

Splits the claim into atomic, checkable parts and links each part to evidence ids from the run's
evidence pack. Source attribution (`source_url`, `kb_page`, `kb_name`, `citations`) is derived on
the server from those ids, so the model can't invent a URL or a chunk number.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

from achp.evidence.pack import EvidencePack
from achp.llm.runtime import GroqRuntime, LLMResult, get_runtime
from achp.prompts.contract import build_messages
from achp.prompts.schemas import ProposerOutput

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Output models (public shape unchanged; evidence_ids added)
# ─────────────────────────────────────────────────────────────────────────────

class AtomicClaim(BaseModel):
    id: str
    text: str
    verifiable: bool
    confidence: float = Field(ge=0.0, le=1.0)
    citations: List[str] = []
    epistemic_marker: str = "claims"
    source_url: Optional[str] = None   # URL of the first cited web evidence item
    kb_page: Optional[int] = None      # chunk index of the first cited library item
    kb_name: Optional[str] = None
    evidence_ids: List[str] = []


class ClaimAnalysis(BaseModel):
    original_input: str
    atomic_claims: List[AtomicClaim]
    overall_confidence: float = Field(ge=0.0, le=1.0)
    claim_type: str   # "factual"|"opinion"|"prediction"|"mixed"
    context_summary: str
    retrieved_context: List[str] = []
    latency_ms: float = 0.0
    model_used: str = ""
    token_usage: Dict[str, int] = {}


def _as_pack(claim: str, context: Union[EvidencePack, List[str], None]) -> EvidencePack:
    if isinstance(context, EvidencePack):
        return context
    return EvidencePack.build(claim, context=context or [])


def to_claim_analysis(claim: str, out: ProposerOutput, pack: EvidencePack,
                      result: Optional[LLMResult] = None) -> ClaimAnalysis:
    atomic: List[AtomicClaim] = []
    for i, c in enumerate(out.claims, start=1):
        ids = pack.valid(c.evidence_ids)
        items = [pack.get(e) for e in ids]
        web = next((it for it in items if it and it.kind == "web" and it.url), None)
        kb = next((it for it in items if it and it.kind == "kb"), None)
        atomic.append(AtomicClaim(
            id=f"C{i}",
            text=c.text.strip() or claim,
            verifiable=c.verifiable,
            confidence=c.confidence,
            epistemic_marker=c.epistemic_marker,
            evidence_ids=ids,
            citations=[f"{it.label()} [{it.evidence_id}]" for it in items if it],
            source_url=web.url if web else None,
            kb_page=kb.kb_chunk_index if kb else None,
            kb_name=kb.kb_name if kb else None,
        ))
    if not atomic:
        # A claim always has at least itself as a part; this adds no facts.
        atomic.append(AtomicClaim(id="C1", text=claim, verifiable=True, confidence=out.overall_confidence))
    return ClaimAnalysis(
        original_input=claim,
        atomic_claims=atomic,
        overall_confidence=out.overall_confidence,
        claim_type=out.claim_type,
        context_summary=out.context_summary,
        retrieved_context=[it.text for it in pack.items],
        latency_ms=result.latency_ms if result else 0.0,
        model_used=result.model if result else "",
        token_usage={"prompt_tokens": result.prompt_tokens, "completion_tokens": result.completion_tokens}
        if result else {},
    )


class ProposerAgent:
    AGENT_ID = "proposer"

    def __init__(self, runtime: Optional[GroqRuntime] = None):
        self._runtime = runtime

    @property
    def runtime(self) -> GroqRuntime:
        return self._runtime or get_runtime()

    async def run(self, claim: str, pack: EvidencePack, *, run_id: Optional[str] = None
                  ) -> tuple[ClaimAnalysis, LLMResult]:
        """Decompose a claim. Raises LLMUnavailable if no model can answer (never a stub)."""
        messages = build_messages("proposer", {"CLAIM": claim, "EVIDENCE": pack.prompt_view()})
        result = await self.runtime.complete("proposer", messages, ProposerOutput, run_id=run_id)
        analysis = to_claim_analysis(claim, result.value, pack, result)
        logger.info("Proposer | %d parts | type=%s | %s | %.0fms",
                    len(analysis.atomic_claims), analysis.claim_type, result.model, result.latency_ms)
        return analysis, result

    async def analyze(
        self,
        claim: str,
        retrieved_context: Union[EvidencePack, List[str], None] = None,
    ) -> ClaimAnalysis:
        """Compatible entry point (older callers pass a list of context strings)."""
        analysis, _ = await self.run(claim, _as_pack(claim, retrieved_context))
        return analysis

    async def health_check(self) -> Dict[str, Any]:
        try:
            result = await self.analyze("The sky is blue.")
            return {"status": "ok", "claims": len(result.atomic_claims), "model": result.model_used}
        except Exception as e:
            return {"status": "error", "error": str(e)}

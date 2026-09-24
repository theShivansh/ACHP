"""Shared fakes: a retriever and a Groq transport that answer by response schema."""
from __future__ import annotations

from typing import Any, Dict, List

from achp.agents.retriever import RetrievalResult
from achp.core.core_pipeline import CorePipeline
from achp.evidence.pack import EvidencePack
from achp.llm.runtime import GroqRuntime, TransportResponse
from achp.prompts import schemas as s

CLAIM = "Regular exercise reduces heart disease risk by 30 to 40 percent."


class FakeRetriever:
    def __init__(self, docs=None):
        self.queries: List[str] = []
        self.docs = docs if docs is not None else [
            {"content": "Active adults have a 20 to 35 percent lower risk of heart disease.",
             "source": "https://www.health-agency.example/facts", "metadata": {"title": "Facts"}},
        ]

    async def retrieve(self, query, *, kb_chunks=None, kb_name=None, extra_context=None, on_action=None):
        self.queries.append(query)
        if on_action:
            await on_action("search_web", "Searching the web", query)
        pack = EvidencePack.build(query, kb_chunks=kb_chunks or [], kb_name=kb_name, web_docs=self.docs)
        return RetrievalResult(query=query, docs=[], from_cache=False, latency_ms=1.0, pack=pack)


def proposer_out() -> s.ProposerOutput:
    return s.ProposerOutput(
        claims=[
            s.ProposedClaim(claim_id="C1", text="Regular exercise reduces heart disease risk", verifiable=True,
                            confidence=0.9, epistemic_marker="claims", evidence_ids=["e1"]),
            s.ProposedClaim(claim_id="C2", text="by 30 to 40 percent", verifiable=True, confidence=0.8,
                            epistemic_marker="claims", evidence_ids=["e1", "e77"]),
        ],
        claim_type="factual", overall_confidence=0.85, context_summary="Exercise and heart risk.",
    )


def bundle_out() -> s.AnalysisBundleOutput:
    view = s.PerspectiveView(stakeholder="Cardiologists", viewpoint="Depends on intensity.", key_points=[])
    return s.AnalysisBundleOutput(
        fact_challenge=s.FactChallengeOut(
            challenges=[
                s.ChallengeOut(claim_id="C1", verdict="supported", confidence=0.9, supporting_evidence_ids=["e1"],
                               counter_evidence_ids=[], missing_evidence=[], logical_fallacies=[], epistemic_flags=[]),
                s.ChallengeOut(claim_id="C2", verdict="refuted", confidence=0.8, supporting_evidence_ids=[],
                               counter_evidence_ids=["e1"], missing_evidence=[], logical_fallacies=[], epistemic_flags=[]),
            ],
            overall_factual_score=0.55,
            critical_flaws=[s.CriticalFlaw(kind="contradicted_by_evidence", text="The agency figure is lower.",
                                           evidence_ids=["e1"])],
            flaws=[s.Flaw(claim_id="C2", quote="30 to 40 percent", relation="contradicts", evidence_ids=["e1"],
                          severity=3)],
            public_note="A health agency puts the reduction at 20 to 35 percent.",
        ),
        narrative_audit=s.NarrativeAuditOut(
            missing_perspectives=[s.MissingPerspectiveOut(stakeholder="Older adults", viewpoint="Benefit varies.",
                                                          why_missing="Not addressed.", significance=0.6,
                                                          evidence_ids=[])],
            represented_stakeholders=["Adults"], framing_asymmetries=[], silenced_voices=[],
            perspective_completeness_score=0.7, narrative_stance="balanced", flaws=[], public_note="",
        ),
        language_signals=s.LanguageSignalsOut(
            bias_axes=s.BiasAxes(**{k: 0.05 for k in s.BiasAxes.model_fields}), dominant_bias="none",
            bias_score=0.1, bias_phrases=[], epistemic_quality=0.7, overclaiming=True, hedging_adequate=False,
            loaded_language=[], opposing=view, neutral=view, missing_stakeholders=[], perspective_score=0.65,
        ),
    )


def judge_out(**over) -> s.JudgeOutput:
    base = dict(
        verdict="MIXED", verdict_confidence=0.8,
        claims=[s.JudgeClaimOut(claim_id="C1", label="supported", evidence_for=["e1"], evidence_against=[], missing_context=None),
                s.JudgeClaimOut(claim_id="C2", label="contradicted", evidence_for=[], evidence_against=["e1"], missing_context=None)],
        metrics=s.JudgeMetricsOut(CTS=0.55, NSS=0.6, BIS=0.15, PCS=0.7, EPS=0.6),
        consensus_reasoning="Exercise helps [e1], but the percentage is overstated [e1].",
        key_supporting_evidence_ids=["e1"], key_contradicting_evidence_ids=["e1"],
        important_caveats=["Figures vary by age."], debate_summary="", needs_second_round=False,
        second_round_reason=None, public_note="The benefit is real; the percentage is overstated.",
    )
    base.update(over)
    return s.JudgeOutput(**base)


class RoleTransport:
    """Answers by response schema name; `judge` may be a list of outputs (one per call) or an error."""

    def __init__(self, judge: Any = None, fail: Dict[str, Exception] | None = None):
        self.calls: List[str] = []
        self.models: List[str] = []
        self._judge = judge if isinstance(judge, list) else [judge or judge_out()]
        self._fail = fail or {}

    async def __call__(self, *, model, response_format, **kw) -> TransportResponse:
        name = response_format["json_schema"]["name"]
        self.calls.append(name)
        self.models.append(model)
        if name in self._fail:
            raise self._fail[name]
        if name == "ProposerOutput":
            out = proposer_out()
        elif name == "AnalysisBundleOutput":
            out = bundle_out()
        elif name == "JudgeOutput":
            out = self._judge.pop(0) if len(self._judge) > 1 else self._judge[0]
        elif name == "QAOutput":
            out = s.QAOutput(found=True, sentences=[
                s.QASentence(text="Guidelines recommend 150 minutes a week.", chunk_ids=[3, 99]),
                s.QASentence(text="An invented sentence with no chunk.", chunk_ids=[42]),
            ])
        else:
            raise AssertionError(name)
        return TransportResponse(out.model_dump_json(), "stop", 200, 50)


def pipeline_with(transport, retriever=None) -> CorePipeline:
    rt = GroqRuntime(transport, backoff_base_s=0.0, deadline_s=5)
    p = CorePipeline(runtime=rt)
    p._load_agents()
    p._retriever = retriever or FakeRetriever()
    return p

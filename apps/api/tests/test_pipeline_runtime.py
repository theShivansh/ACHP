"""End-to-end pipeline on a fake Groq transport: 3 calls, grounded output, honest failure, API shape."""
from __future__ import annotations

import json
from typing import Any, Callable, Dict, List

import pytest

import achp.nil.nil_layer as nil_layer
from achp.agents.retriever import RetrievalResult
from achp.core.core_pipeline import CorePipeline, PipelineError
from achp.evidence.pack import EvidencePack
from achp.llm.runtime import GroqRuntime, TransportError, TransportResponse
from achp.prompts import schemas as s

CLAIM = "Regular exercise reduces heart disease risk by 30 to 40 percent."


@pytest.fixture(autouse=True)
def no_embedding_model(monkeypatch):
    # The NIL framing check falls back to its lexical path; tests don't download models.
    monkeypatch.setattr(nil_layer, "_get_encoder_singleton", lambda: None)
    monkeypatch.setattr(nil_layer, "_encoder_ok", False)


class FakeRetriever:
    def __init__(self, docs=None):
        self.queries: List[str] = []
        self.docs = docs if docs is not None else [
            {"content": "Active adults have a 20 to 35 percent lower risk of heart disease.",
             "source": "https://www.health-agency.example/facts", "metadata": {"title": "Facts"}},
        ]

    async def retrieve(self, query, *, kb_chunks=None, kb_name=None, extra_context=None):
        self.queries.append(query)
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


async def test_three_groq_calls_grounded_output_and_compatible_shape():
    t = RoleTransport()
    out = await pipeline_with(t).run(CLAIM)
    assert t.calls == ["ProposerOutput", "AnalysisBundleOutput", "JudgeOutput"]
    assert set(t.models) == {"openai/gpt-oss-120b"}
    assert out.pipeline["groq_calls"] == 3 and out.debate_rounds == 1
    assert out.verdict == "MIXED"
    # Legacy fields are all present
    for key in ("run_id", "verdict", "verdict_confidence", "composite_score", "metrics", "nil", "atomic_claims",
                "adversary_a", "adversary_b", "consensus_reasoning", "key_evidence", "caveats", "pipeline", "security"):
        assert key in out.model_dump()
    assert set(out.metrics) == {"CTS", "PCS", "BIS", "NSS", "EPS"}
    # Evidence ids are real; the unknown e77 was dropped; URLs come from the pack
    c2 = out.atomic_claims[1]
    assert c2["evidence_ids"] == ["e1"] and c2["source_url"] == "https://www.health-agency.example/facts"
    assert "20 to 35 percent" in out.key_evidence["contradicting"][0]
    assert out.evidence[0]["evidence_id"] == "e1"
    assert out.adversary_a["flaws"][0]["quote"] == "30 to 40 percent"
    assert {c["label"] for c in out.claim_labels} == {"supported", "contradicted"}
    assert out.pipeline["models"]["adversary_a"] == out.pipeline["models"]["adversary_b"]


async def test_kb_chunks_are_evidence_not_part_of_the_claim():
    retr = FakeRetriever()
    out = await pipeline_with(RoleTransport(), retr).run(
        CLAIM, kb_chunks=[{"chunk_index": 3, "text": "Library: 150 minutes a week.", "score": 0.9}], kb_name="Notes")
    assert retr.queries == [CLAIM]                 # the web search saw only the claim
    assert out.input == CLAIM
    assert out.evidence[0]["kind"] == "kb" and out.evidence[0]["kb_chunk_index"] == 3


async def test_second_round_only_when_the_judge_asks():
    t = RoleTransport(judge=[
        judge_out(verdict_confidence=0.5, needs_second_round=True, second_round_reason="Sources conflict."),
        judge_out(verdict_confidence=0.85),
    ])
    out = await pipeline_with(t).run(CLAIM)
    assert t.calls == ["ProposerOutput", "AnalysisBundleOutput", "JudgeOutput", "AnalysisBundleOutput", "JudgeOutput"]
    assert out.debate_rounds == 2


async def test_no_evidence_means_unverifiable_not_a_guess():
    out = await pipeline_with(RoleTransport(), FakeRetriever(docs=[])).run(CLAIM)
    assert out.verdict == "UNVERIFIABLE"
    assert out.adversary_a["factual_score"] == 0.5
    assert out.pipeline["grounding"]["verdict_forced_unverifiable"] == 1


async def test_a_failed_stage_raises_and_produces_no_verdict():
    t = RoleTransport(fail={"JudgeOutput": TransportError(500, "upstream down")})
    with pytest.raises(PipelineError) as e:
        await pipeline_with(t).run(CLAIM)
    assert e.value.stage == "judge" and e.value.retryable


async def test_rate_limited_primary_falls_back_to_20b():
    class Limited(RoleTransport):
        async def __call__(self, *, model, response_format, **kw):
            if model == "openai/gpt-oss-120b" and response_format["json_schema"]["name"] == "AnalysisBundleOutput":
                self.calls.append("429")
                raise TransportError(429, "rate limited", {"retry-after": "30"})
            return await super().__call__(model=model, response_format=response_format, **kw)

    t = Limited()
    out = await pipeline_with(t).run(CLAIM)
    assert out.pipeline["models"]["adversary_a"] == "openai/gpt-oss-20b"
    # Groq quotas are per model: while 120b cools down for Retry-After (30s), the Judge also
    # goes to 20b instead of hitting the same limit.
    assert out.pipeline["models"]["judge"] == "openai/gpt-oss-20b"
    assert t.calls.count("429") == 1


# ── HTTP compatibility ──────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
    import main
    from fastapi.testclient import TestClient
    from achp.llm import runtime as runtime_mod

    transport = RoleTransport()
    rt = GroqRuntime(transport, backoff_base_s=0.0, deadline_s=5)
    monkeypatch.setattr(runtime_mod, "_runtime", rt)
    p = pipeline_with(transport)
    monkeypatch.setattr(main, "_pipeline", p)
    monkeypatch.setattr(main, "get_pipeline", lambda: p)
    return TestClient(main.app), transport, p


def test_analyze_response_shape_is_unchanged(client):
    c, _, _ = client
    r = c.post("/analyze", json={"claim": CLAIM})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"run_id", "timestamp", "claim", "verdict", "verdict_confidence", "verified_answer",
                         "transparency_report", "alternative_perspectives", "artifacts", "kb_used"}
    assert body["verdict"] == "MIXED" and body["claim"] == CLAIM
    assert {"evidence", "claim_labels", "atomic_claims"} <= set(body["artifacts"])
    assert r.headers["X-Run-Id"] == body["run_id"]


def test_analyze_failure_is_503_with_detail_and_no_verdict(client):
    c, transport, _ = client
    transport._fail["JudgeOutput"] = TransportError(503, "down")
    r = c.post("/analyze", json={"claim": CLAIM})
    assert r.status_code == 503
    body = r.json()
    assert body["stage"] == "judge" and "verdict" not in body and "no verdict" in body["detail"]


def test_offline_flag_no_longer_returns_a_mock_verdict(client):
    c, _, _ = client
    r = c.post("/analyze", json={"claim": CLAIM, "offline": True})
    assert r.status_code == 400 and "verdict" not in r.json()


def test_qa_keeps_only_citations_to_retrieved_chunks(client, monkeypatch):
    import main
    c, _, _ = client

    async def get_kb(kb_id):
        return {"kb_id": kb_id, "name": "Notes", "status": "ready"}

    async def search(kb_id, q, top_k=6):
        return [{"chunk_index": 3, "text": "Adults should do 150 minutes a week.", "score": 0.8}]

    monkeypatch.setattr(main.kb_manager, "get_kb", get_kb)
    monkeypatch.setattr(main.kb_manager, "search", search)
    r = c.post("/qa", json={"question": "How much exercise?", "kb_id": "kb1"})
    assert r.status_code == 200, r.text
    answer = r.json()["answer"]
    assert "[3]" in answer and "[99]" not in answer and "invented sentence" not in answer


def test_health_llm_reports_registry_without_secrets(client):
    c, _, _ = client
    body = c.get("/health/llm").json()
    assert body["logical_agents"]["judge"]["fallback"] == "openai/gpt-oss-20b"
    assert "GROQ_API_KEY" not in json.dumps(body)

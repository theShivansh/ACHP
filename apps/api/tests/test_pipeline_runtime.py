"""End-to-end pipeline on a fake Groq transport: 3 calls, grounded output, honest failure, API shape."""
from __future__ import annotations

import json

import pytest

from achp.core.core_pipeline import PipelineError
from achp.llm.runtime import GroqRuntime, TransportError
from achp.prompts import schemas as s
from tests.fakes import CLAIM, FakeRetriever, RoleTransport, judge_out, pipeline_with


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

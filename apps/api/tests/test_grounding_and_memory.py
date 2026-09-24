"""Evidence-first grounding and the hierarchical memory's freshness rules."""
from __future__ import annotations

import pytest

from achp.evidence.grounding import find_span, ground_bundle, ground_judge, is_verbatim, strip_foreign_urls
from achp.evidence.pack import EvidencePack
from achp.memory.evidence_cache import EvidenceCache, query_key
from achp.prompts import schemas as s

CLAIM = "Regular exercise reduces heart disease risk by 30 to 40 percent."
PARTS = {"C1": "Regular exercise reduces heart disease risk", "C2": "by 30 to 40 percent"}


def pack() -> EvidencePack:
    return EvidencePack.build(CLAIM, web_docs=[
        {"content": "Active adults have a 20 to 35 percent lower risk of heart disease.",
         "source": "https://www.health-agency.example/facts", "metadata": {"title": "Facts"}},
        {"content": "Exercise lowers blood pressure.", "source": "https://journal.example/a"},
    ], kb_chunks=[{"chunk_index": 4, "text": "Library note on activity guidelines.", "score": 0.9}],
        kb_name="Notes")


def bundle(**over) -> s.AnalysisBundleOutput:
    view = s.PerspectiveView(stakeholder="x", viewpoint="y", key_points=[])
    fc = dict(
        challenges=[
            s.ChallengeOut(claim_id="C1", verdict="supported", confidence=0.8, supporting_evidence_ids=["e2"],
                           counter_evidence_ids=[], missing_evidence=[], logical_fallacies=[], epistemic_flags=[]),
            s.ChallengeOut(claim_id="C2", verdict="refuted", confidence=0.9, supporting_evidence_ids=[],
                           counter_evidence_ids=["e9"], missing_evidence=[], logical_fallacies=[], epistemic_flags=[]),
        ],
        overall_factual_score=0.2,
        critical_flaws=[s.CriticalFlaw(kind="contradicted_by_evidence", text="See https://fake.example/x", evidence_ids=["e7"])],
        flaws=[s.Flaw(claim_id="C2", quote="30 to 40 percent", relation="contradicts", evidence_ids=["e2"], severity=3),
               s.Flaw(claim_id="C2", quote="invented words", relation="missing_context", evidence_ids=[], severity=1)],
        public_note="Two sources put it lower.",
    )
    fc.update(over.get("fc", {}))
    return s.AnalysisBundleOutput(
        fact_challenge=s.FactChallengeOut(**fc),
        narrative_audit=s.NarrativeAuditOut(missing_perspectives=[], represented_stakeholders=[],
                                            framing_asymmetries=[], silenced_voices=[],
                                            perspective_completeness_score=0.7, narrative_stance="balanced",
                                            flaws=[], public_note=""),
        language_signals=s.LanguageSignalsOut(
            bias_axes=s.BiasAxes(**{k: 0.0 for k in s.BiasAxes.model_fields}), dominant_bias="none",
            bias_score=0.1, bias_phrases=["30 to 40 percent", "shocking lie"], epistemic_quality=0.7,
            overclaiming=False, hedging_adequate=True, loaded_language=["REGULAR exercise", "catastrophe"],
            opposing=view, neutral=view, missing_stakeholders=[], perspective_score=0.6),
    )


def test_pack_ids_order_library_first_and_render_from_stored_text():
    p = pack()
    assert p.ids() == ["e1", "e2", "e3"] and p.get("e1").kind == "kb"
    assert "20 to 35 percent" in p.cite("e2") and "[e2]" in p.cite("e2")
    assert p.valid(["e2", "[E2]", "e99", "e3"]) == ["e2", "e3"]


def test_ground_bundle_removes_unknown_ids_and_ungrounded_findings():
    b, dropped = ground_bundle(bundle(), pack(), CLAIM, PARTS)
    c1, c2 = b.fact_challenge.challenges
    assert c1.verdict == "supported"                 # e2 exists
    assert c2.verdict == "unverifiable"              # its only counter-evidence (e9) doesn't exist
    assert b.fact_challenge.critical_flaws == []     # contradicted_by_evidence citing e7 only
    assert b.fact_challenge.flaws[1].quote == PARTS["C2"]   # made-up quote → whole part
    assert b.language_signals.bias_phrases == ["30 to 40 percent"]
    assert b.language_signals.loaded_language == ["REGULAR exercise"]
    assert dropped["unknown_evidence_id"] >= 1 and dropped["ungrounded_verdict"] == 1


def test_no_grounded_finding_neutralises_the_factual_score():
    b, dropped = ground_bundle(bundle(), EvidencePack(query=CLAIM), CLAIM, PARTS)
    assert all(c.verdict == "unverifiable" for c in b.fact_challenge.challenges)
    assert b.fact_challenge.overall_factual_score == 0.5
    assert dropped["factual_score_neutralised"] == 1


def judge(**over) -> s.JudgeOutput:
    base = dict(
        verdict="FALSE", verdict_confidence=0.9,
        claims=[s.JudgeClaimOut(claim_id="C1", label="supported", evidence_for=["e2"], evidence_against=[], missing_context=None),
                s.JudgeClaimOut(claim_id="C2", label="contradicted", evidence_for=[], evidence_against=["e2"], missing_context=None)],
        metrics=s.JudgeMetricsOut(CTS=0.3, NSS=0.5, BIS=0.2, PCS=0.6, EPS=0.5),
        consensus_reasoning="The agency figure [e2] is lower; see [e8] and https://made-up.example.",
        key_supporting_evidence_ids=["e2", "e8"], key_contradicting_evidence_ids=["e2"],
        important_caveats=[], debate_summary="", needs_second_round=False, second_round_reason=None,
        public_note="The percentage is overstated.",
    )
    base.update(over)
    return s.JudgeOutput(**base)


def test_ground_judge_keeps_grounded_labels_and_scrubs_text():
    j, dropped = ground_judge(judge(), pack(), ["C1", "C2"])
    assert j.verdict == "FALSE"
    assert "[e8]" not in j.consensus_reasoning and "made-up.example" not in j.consensus_reasoning
    assert "[e2]" in j.consensus_reasoning
    assert j.key_supporting_evidence_ids == ["e2"]


def test_ungrounded_judge_verdict_becomes_unverifiable():
    ungrounded = judge(claims=[s.JudgeClaimOut(claim_id="C1", label="contradicted", evidence_for=[],
                                               evidence_against=["e42"], missing_context=None)])
    j, dropped = ground_judge(ungrounded, pack(), ["C1"])
    assert j.claims[0].label == "unverifiable"
    assert j.verdict == "UNVERIFIABLE" and j.verdict_confidence <= 0.5
    assert dropped["verdict_forced_unverifiable"] == 1
    assert j.important_caveats and "can't be rated" in j.important_caveats[0]


def test_empty_pack_always_yields_unverifiable():
    j, _ = ground_judge(judge(), EvidencePack(query=CLAIM), ["C1", "C2"])
    assert j.verdict == "UNVERIFIABLE"


@pytest.mark.parametrize("hay,quote,expected", [
    ("Exercise cuts risk by 30 to 40 percent.", "30 to 40 percent", (22, 38)),
    ("Exercise cuts risk by 30 to 40 percent.", "30 TO 40 PERCENT", (22, 38)),
    ("Exercise cuts risk by 30 to 40 percent.", "by 30 to 40 percnt", (19, 38)),
    ("Exercise cuts risk by 30 to 40 percent.", "vaccines cause autism", None),
])
def test_find_span(hay, quote, expected):
    assert find_span(hay, quote) == expected


def test_verbatim_and_url_rules():
    assert is_verbatim("A  lower\nrisk", "a lower risk")
    assert not is_verbatim("A lower risk", "a higher risk")
    assert strip_foreign_urls("see https://journal.example/a and https://evil.example/b", pack()) == \
        "see https://journal.example/a and"


def test_evidence_cache_is_exact_keyed_fresh_and_never_caches_empties():
    now = [1000.0]
    cache = EvidenceCache(ttl_s=60, clock=lambda: now[0])
    docs = [{"content": "c", "source": "https://a.example", "metadata": {}}]
    cache.set("Climate change is a hoax", docs)
    assert query_key("Climate change is a hoax") != query_key("Climate change is not a hoax")
    assert cache.get("Climate change is not a hoax") is None           # no near-duplicate hits
    hit = cache.get("  climate   change is a HOAX ")                       # normalized exact match
    assert hit and hit[0]["metadata"]["retrieved_at"] == 1000.0
    now[0] += 61
    assert cache.get("Climate change is a hoax") is None               # stale evidence is dropped
    cache.set("empty", [])
    assert cache.get("empty") is None

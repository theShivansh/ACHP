"""The scorer on hand-made records whose right answers are known.

    python -m pytest -q bench
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bench_score", HERE / "score.py")
S = importlib.util.module_from_spec(spec)
sys.modules["bench_score"] = S
spec.loader.exec_module(S)


def rec(item: dict, label: str | None, *, judge: str | None = None, metrics: dict | None = None, parts=None, evidence=("e1",),
        status: str = "completed", cache: bool = False, ms: int = 40_000, band: str = "strong", retried: bool = False) -> dict:
    events = [{"type": "run.started", "data": {"prompt_version": "p1", "agents": [{"id": "judge", "model": "m"}]}}]
    events += [{"type": "evidence.found", "data": {"evidence": {"evidence_id": e, "quote": "a quote"}}} for e in evidence]
    if label is not None:
        events.append({"type": "verdict.final", "data": {"overall": {"label": label, "judge_verdict": judge, "confidence_band": band},
                                                          "claims": parts if parts is not None else [{"label": label, "evidence_for": list(evidence[:1]), "evidence_against": []}],
                                                          **({"metrics": metrics} if metrics else {})}})
        events.append({"type": "run.completed", "data": {"total_ms": ms, "cache_hit": cache}})
    elif status == "failed":
        events.append({"type": "run.failed", "data": {"stage": "judge"}})
    r = {"item": item, "status": status if label is not None or status != "completed" else "failed", "events": events}
    if retried:
        r["previous_attempts"] = [{"status": "failed"}]
    return S.read(r)


def av(i: int, gold: str) -> dict:
    return {"id": f"a{i}", "suite": "averitec", "gold": gold}


def test_wilson_matches_a_known_value():
    w = S.wilson(8, 10)
    assert w["rate"] == 0.8 and w["low"] == pytest.approx(0.4902, abs=1e-3) and w["high"] == pytest.approx(0.9433, abs=1e-3)
    assert S.wilson(0, 0)["rate"] is None


def test_macro_f1_is_one_when_perfect_and_counts_every_class():
    g = ["supported", "contradicted", "mixed", "unverifiable"]
    assert S.macro_f1(g, g) == 1.0
    assert S.macro_f1(g, ["supported"] * 4) == pytest.approx((2 / 5) / 4)


def test_a_failed_run_is_no_verdict_and_wrong_and_missing_context_counts_as_mixed():
    rows = [
        rec(av(1, "supported"), "supported"),
        rec(av(2, "contradicted"), None, status="failed"),
        rec(av(3, "mixed"), "missing_context"),
        rec(av(4, "unverifiable"), "blocked"),
    ]
    out = S.score_averitec(rows)
    assert out["accuracy"]["k"] == 2 and out["accuracy"]["n"] == 4
    assert out["coverage"]["k"] == 3
    assert out["confusion"]["contradicted"] == {"no_verdict": 1}
    assert out["accuracy_when_a_verdict_was_given"]["rate"] == pytest.approx(2 / 3, abs=1e-4)


def test_a_decisive_error_is_true_called_false_or_false_called_true():
    rows = [rec(av(1, "supported"), "contradicted"), rec(av(2, "contradicted"), "contradicted"), rec(av(3, "contradicted"), "unverifiable")]
    tf = S.score_averitec(rows)["true_false"]
    assert tf["decisive_error"]["k"] == 1 and tf["decisive_error"]["n"] == 3
    assert tf["direction_accuracy_when_decided"]["k"] == 1 and tf["direction_accuracy_when_decided"]["n"] == 2


def test_the_formula_verdict_comes_from_the_reference_assay():
    high = {"CTS": 0.95, "PCS": 0.9, "BIS": 0.1, "NSS": 0.95, "EPS": 0.85}
    low = {"CTS": 0.1, "PCS": 0.3, "BIS": 0.8, "NSS": 0.2, "EPS": 0.2}
    rows = [rec(av(1, "supported"), "supported", judge="TRUE", metrics=high), rec(av(2, "contradicted"), "supported", judge="TRUE", metrics=low)]
    jf = S.score_averitec(rows)["judge_vs_formula"]
    assert jf["formula_accuracy"]["k"] == 2 and jf["judge_accuracy"]["k"] == 1
    assert jf["two_key"] == {"agree": 1, "split": 1}


def test_weighting_back_to_the_dev_mix_uses_per_class_recall():
    rows = [rec(av(1, "supported"), "supported"), rec(av(2, "contradicted"), "supported")]
    out = S.score_averitec(rows)
    assert out["accuracy_weighted_to_dev_mix"] == pytest.approx(122 / 500, abs=1e-4)


def test_safety_counts_blocks_both_ways():
    rows = [
        rec({"id": "i1", "suite": "safety", "kind": "injection", "gold": "blocked"}, "blocked", parts=[]),
        rec({"id": "i2", "suite": "safety", "kind": "injection", "gold": "blocked"}, "supported"),
        rec({"id": "b1", "suite": "safety", "kind": "benign", "gold": "not_blocked"}, "blocked", parts=[]),
        rec({"id": "b2", "suite": "safety", "kind": "benign", "gold": "not_blocked"}, "supported"),
    ]
    out = S.score_safety(rows)
    assert out["injections_blocked"]["k"] == 1 and out["injections_not_blocked"] == ["i2"]
    assert out["benign_wrongly_blocked"]["k"] == 1 and out["benign_blocked_ids"] == ["b1"]


def test_negations_must_flip_and_paraphrases_must_agree():
    def m(i, pair, rel, label, cache=False):
        return rec({"id": i, "suite": "metamorphic", "pair": pair, "relation": rel, "gold": "supported"}, label, cache=cache)
    rows = [
        m("n1a", "n1", "negation", "supported"), m("n1b", "n1", "negation", "contradicted"),
        m("n2a", "n2", "negation", "supported"), m("n2b", "n2", "negation", "supported"),
        m("n3a", "n3", "negation", "supported"), m("n3b", "n3", "negation", "unverifiable"),
        m("p1a", "p1", "paraphrase", "supported"), m("p1b", "p1", "paraphrase", "supported", cache=True),
        m("p2a", "p2", "paraphrase", "supported"), m("p2b", "p2", "paraphrase", "mixed"),
    ]
    out = S.score_metamorphic(rows)
    assert out["negation_flips_when_both_decided"]["k"] == 1 and out["negation_flips_when_both_decided"]["n"] == 2
    assert out["paraphrase_same_label"]["k"] == 1 and out["paraphrase_same_label"]["n"] == 2
    assert out["paraphrase_same_label_without_cache"]["n"] == 1


def test_abstention_and_overconfidence():
    def a(i, kind, label, band="strong"):
        return rec({"id": i, "suite": "abstention", "kind": kind, "gold": "unverifiable"}, label, band=band)
    out = S.score_abstention([a("x1", "future", "unverifiable"), a("x2", "future", "contradicted"), a("x3", "private", "supported", "weak")])
    assert out["said_unverifiable"]["k"] == 1
    assert out["strong_true_or_false_ids"] == ["x2"]
    assert out["by_kind"]["future"]["k"] == 1


def test_grounding_finds_a_citation_to_a_source_that_is_not_in_the_log():
    good = rec(av(1, "supported"), "supported", evidence=("e1",))
    bad = rec(av(2, "supported"), "supported", evidence=("e1",), parts=[{"label": "supported", "evidence_for": ["e9"], "evidence_against": []}])
    out = S.score_grounding([good, bad])
    assert out["citations_to_a_source_not_in_the_log"] == 1
    assert out["decisive_parts_with_a_cited_source"]["k"] == 2


def test_operations_use_only_fresh_unblocked_runs_for_time_and_count_retries():
    rows = [rec(av(1, "supported"), "supported", ms=10_000), rec(av(2, "supported"), "supported", ms=30_000, cache=True),
            rec(av(3, "supported"), "supported", ms=20_000, retried=True)]
    out = S.score_operations(rows)
    assert out["seconds_per_check_p50"] == 15.0
    assert out["first_attempt_completed"]["k"] == 2 and out["cache_hits"] == 1


def test_a_run_is_complete_only_when_every_item_was_tried_and_nine_in_ten_have_a_verdict(monkeypatch):
    monkeypatch.setattr(S, "planned", lambda name: 2)
    ok = lambda i, suite: rec({"id": i, "suite": suite, "gold": "supported"}, "supported")  # noqa: E731
    quota = lambda i, suite: S.read({"item": {"id": i, "suite": suite, "gold": "supported"}, "status": "failed",  # noqa: E731
                                     "events": [{"type": "run.failed", "data": {"error_code": "exhausted"}}]})
    full = {n: [ok("a", n), ok("b", n)] for n in S.SUITE_NAMES}
    assert S.completeness(full)["complete"] is True
    short = dict(full, safety=[ok("a", "safety")])
    assert S.completeness(short)["complete"] is False
    outage = dict(full, averitec=[ok("a", "averitec"), quota("b", "averitec")])
    c = S.completeness(outage)
    assert c["complete"] is False and c["suites"]["averitec"]["failed_model_quota"] == 1

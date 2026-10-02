"""The overall verdict never contradicts the verdicts of the parts it is made of."""
import itertools

import pytest

from achp.events.consistency import _LABEL, reconcile_judge

LABELS = ["supported", "contradicted", "mixed", "missing_context", "unverifiable"]
EV = [f"e{i}" for i in range(1, 8)]


def part(label, n_for=0, n_against=0, cid="C1"):
    return {"claim_id": cid, "label": label, "evidence_for": EV[:n_for], "evidence_against": EV[n_for:n_for + n_against]}


def run(verdict, *parts):
    v, claims, notes = reconcile_judge(verdict, list(parts), EV)
    return v, [c["label"] for c in claims], notes


def test_a_refuted_part_is_not_hidden_under_unverifiable():
    # A live run: "You NEED to exercise 5 hours every day or you will definitely get heart disease."
    v, labels, notes = run("UNVERIFIABLE", part("contradicted", 0, 4, "C1"), part("unverifiable", cid="C2"))
    assert v == "MIXED" and labels == ["contradicted", "unverifiable"]
    assert notes and "unverifiable → mixed" in notes[0]


def test_a_single_part_wears_one_stamp_when_its_own_sources_lean_the_same_way():
    # A live run: "Earth is flat" in Hindi. Overall Contradicted, the lone part Mixed with 1 source for and 3 against.
    v, labels, _ = run("FALSE", part("mixed", 1, 3))
    assert v == "FALSE" and labels == ["contradicted"]


def test_a_single_mixed_part_stays_mixed_when_the_sources_really_split():
    v, labels, _ = run("MOSTLY_FALSE", part("mixed", 2, 2))
    assert labels == ["mixed"]
    assert v == "MIXED"  # the overall may not say Contradicted when no part is


def test_support_over_an_unsettled_part_becomes_mixed_and_all_unsettled_becomes_unverifiable():
    assert run("TRUE", part("supported", 3, 0, "C1"), part("unverifiable", cid="C2"))[0] == "MIXED"
    assert run("TRUE", part("unverifiable", cid="C1"), part("unverifiable", cid="C2"))[0] == "UNVERIFIABLE"


def test_consistent_verdicts_are_left_alone():
    assert run("TRUE", part("supported", 5), part("supported", 4, 0, "C2"))[0] == "TRUE"
    assert run("MOSTLY_TRUE", part("supported", 5))[0] == "MOSTLY_TRUE"
    assert run("FALSE", part("contradicted", 0, 5))[0] == "FALSE"
    # the recorded "exercise" log: one part supported, one unsettled, overall Mixed
    assert run("MIXED", part("supported", 4, cid="C1"), part("unverifiable", cid="C2"))[0] == "MIXED"
    # the recorded "unverifiable" log: one part unsettled, one refuted, the Judge said False
    assert run("FALSE", part("unverifiable", cid="C1"), part("contradicted", 0, 2, "C2"))[0] == "FALSE"
    # a lone Mixed part (sources for and against) with an overall Mixed
    assert run("MIXED", part("mixed", 2, 1))[0] == "MIXED"


def test_a_blocked_run_and_an_empty_part_list_are_untouched():
    assert reconcile_judge("BLOCKED", [], EV) == ("BLOCKED", [], [])
    assert reconcile_judge("TRUE", [], EV) == ("TRUE", [], [])


def test_unknown_evidence_ids_never_count():
    ghost = {"claim_id": "C1", "label": "mixed", "evidence_for": [], "evidence_against": ["x1", "x2", "x3"]}
    v, claims, _ = reconcile_judge("FALSE", [ghost], EV)
    assert claims[0]["label"] == "mixed"  # none of the cited ids is in the log


def test_the_input_is_not_modified():
    original = [part("mixed", 1, 3)]
    reconcile_judge("FALSE", original, EV)
    assert original[0]["label"] == "mixed"


@pytest.mark.parametrize("verdict", [v for v in _LABEL if v != "BLOCKED"])
def test_for_every_verdict_and_every_set_of_parts_the_headline_never_hides_or_overstates(verdict):
    for n in (1, 2, 3):
        for combo in itertools.product(LABELS, repeat=n):
            parts = [part(label, 2, 2, f"C{i}") for i, label in enumerate(combo)]
            v, claims, _ = reconcile_judge(verdict, parts, EV)
            overall, labels = _LABEL[v], [c["label"] for c in claims]
            if "contradicted" in labels:
                assert overall not in ("supported", "unverifiable"), (verdict, combo, v)
            if overall == "supported":
                assert all(label == "supported" for label in labels), (verdict, combo, v)
            if overall == "contradicted":
                assert "contradicted" in labels, (verdict, combo, v)
            if all(label == "unverifiable" for label in labels):
                assert overall == "unverifiable", (verdict, combo, v)
            # idempotent: running it again changes nothing
            assert reconcile_judge(v, claims, EV)[0] == v, (verdict, combo, v)

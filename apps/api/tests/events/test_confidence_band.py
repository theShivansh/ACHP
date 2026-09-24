"""The confidence band is qualitative, derived from sources and the challenger's agreement."""
from __future__ import annotations

import pytest

from achp.events.confidence import claim_band, overall_band


@pytest.mark.parametrize("label, ev_for, ev_against, challenger, band", [
    ("supported", ["e1", "e2"], [], "supported", "strong"),
    ("supported", ["e1", "e2"], [], "contested", "moderate"),
    ("supported", ["e1"], [], "supported", "moderate"),
    ("supported", ["e1"], [], "refuted", "weak"),
    ("supported", ["e1", "e2"], ["e3"], "supported", "weak"),   # sources point both ways
    ("contradicted", [], ["e1", "e2"], "refuted", "strong"),
    ("contradicted", [], ["e1"], None, "weak"),
    ("mixed", ["e1"], ["e2"], "contested", "strong"),
    ("missing_context", ["e1"], [], "supported", "moderate"),
    ("unverifiable", [], [], "supported", "weak"),
    ("blocked", [], [], None, "weak"),
    ("supported", ["e1", "e1"], [], "supported", "moderate"),   # duplicates count once
])
def test_claim_band(label, ev_for, ev_against, challenger, band):
    got, reason = claim_band(label, ev_for, ev_against, challenger)
    assert got == band
    assert reason and "%" not in reason


def test_overall_is_the_weakest_rated_part():
    parts = [("supported", "strong", "a"), ("contradicted", "moderate", "One source, and the fact challenger agreed.")]
    band, reason = overall_band("mixed", parts, 0.8)
    assert band == "moderate" and reason.startswith("Weakest part:")


def test_unverifiable_parts_dont_drag_a_rated_verdict():
    parts = [("supported", "strong", "Two sources agree."), ("unverifiable", "weak", "No source.")]
    assert overall_band("supported", parts, 0.9)[0] == "strong"


def test_a_low_judge_confidence_lowers_the_band_one_step():
    parts = [("supported", "strong", "Two sources agree.")]
    band, reason = overall_band("supported", parts, 0.4)
    assert band == "moderate" and "one step lower" in reason


def test_unverifiable_and_blocked_runs_are_weak():
    assert overall_band("unverifiable", [], 0.9)[0] == "weak"
    assert overall_band("blocked", [], 1.0) == ("weak", "The message was not checked.")

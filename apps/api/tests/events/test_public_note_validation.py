"""06 §5: model-written public notes are shown only if they pass; otherwise the template is used."""
from __future__ import annotations

import pytest

from achp.events import notes

FALLBACK = "Checked 3 parts against the sources: 1 held up, 2 did not."
KNOWN = ["e1", "e2"]


@pytest.mark.parametrize("note, problem", [
    ("x" * 141, "too_long"),
    ("The agency's figure is at https://health.example/facts, lower than claimed.", "url"),
    ("See www.health-agency.example for the figure.", "url"),
    ("Let me think… the figure looks overstated.", "process_talk"),
    ("I think the percentage is overstated.", "process_talk"),
    ("Step 1: compare the figure with e1.", "process_talk"),
    ("My reasoning: the agency figure is lower.", "process_talk"),
    ("<think>compare</think> The figure is lower.", "process_talk"),
    ("Source e7 puts the figure at 20 percent.", "unknown_evidence"),
    ("", "empty"),
    (None, "empty"),
])
def test_bad_notes_fall_back_to_the_template(note, problem):
    assert notes.note_problem(note, KNOWN) == problem
    text, source = notes.validate_note(note, FALLBACK, KNOWN)
    assert (text, source) == (FALLBACK, "template")


def test_a_good_note_is_kept_and_whitespace_normalised():
    text, source = notes.validate_note("  Two health agencies put the\nreduction at 20–35% [e1].  ", FALLBACK, KNOWN)
    assert source == "model"
    assert text == "Two health agencies put the reduction at 20–35% [e1]."


def test_exactly_140_characters_is_allowed():
    note = "a" * 139 + "."
    assert notes.validate_note(note, FALLBACK)[1] == "model"


def test_templates_are_short_and_plain():
    samples = [
        notes.gatekeeper_note(True), notes.gatekeeper_note(False),
        notes.clipper_note(3, 1), notes.clipper_note(0, 0), notes.clipper_note(2, 0, from_cache=True),
        notes.decomposer_note(3), notes.decomposer_note(1), notes.decomposer_note(0),
        notes.fact_challenger_note(1, 2, 0), notes.fact_challenger_note(0, 0, 0),
        notes.narrative_auditor_note(2), notes.narrative_auditor_note(0),
        notes.framing_note([], []), notes.framing_note(["shocking"], ["all"]),
        notes.judge_note(["supported", "contradicted", "missing_context"]), notes.judge_note([]),
    ]
    for s in samples:
        assert notes.note_problem(s) is None, s
    assert notes.clipper_note(3, 1) == "Pinned 4 sources: 3 from the web, 1 from your library."
    assert notes.decomposer_note(3) == "Cut the message into 3 checkable parts."
    assert notes.framing_note(["shocking"], ["all"]) == "Wording check: 1 loaded word ('shocking'); 1 absolute term ('all')."

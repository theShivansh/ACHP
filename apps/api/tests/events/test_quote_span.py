"""Quote → span (06 §6), verbatim evidence quotes (06 §3.2) and claim source spans."""
from __future__ import annotations

from types import SimpleNamespace

from achp.events import RunEvents, RunEventBus, SQLiteEventStore
from achp.events.emitter import evidence_object, pick_quote, source_span, word_spans
from achp.evidence.grounding import find_span
from achp.evidence.pack import EvidencePack

PART = "Just 10 minutes a day is enough to cut heart disease risk by 30 to 40 percent."


def test_exact_then_case_insensitive_then_fuzzy():
    assert find_span(PART, "30 to 40 percent") == (PART.index("30"), PART.index("30") + 16)
    s, e = find_span(PART, "just 10 MINUTES")
    assert PART[s:e] == "Just 10 minutes"
    s, e = find_span(PART, "30 to 40 per cent")          # fuzzy ≥ 0.85
    assert PART[s:e] == "30 to 40 percent"
    assert find_span(PART, "vitamin C prevents colds") is None


async def test_marks_fall_back_to_the_whole_part_and_drop_unknown_evidence():
    bus = RunEventBus(SQLiteEventStore(":memory:"))
    rid = bus.create_run({"text": PART})
    ev = RunEvents(bus, rid)
    ev.evidence_ids = ["e1"]
    flaws = [
        {"claim_id": "C1", "quote": "30 to 40 percent", "relation": "contradicts", "evidence_ids": ["e1", "e9"], "severity": 3},
        {"claim_id": "C1", "quote": "a sentence that is not there", "relation": "missing_context", "evidence_ids": []},
        {"claim_id": "C1", "quote": "30 to 40 percent", "relation": "contradicts", "evidence_ids": ["e1"]},  # repeat
        {"claim_id": "C9", "quote": "x", "relation": "unclear", "evidence_ids": []},                        # unknown part
    ]
    assert await ev.marks("adversary_a", flaws, {"C1": PART}) == 2
    marks = [e.data for e in bus.events(rid)]
    assert marks[0]["span"] == [PART.index("30"), PART.index("30") + 16]
    assert marks[0]["evidence_ids"] == ["e1"] and marks[0]["severity"] == 3
    assert marks[1]["span"] == [0, len(PART)]


def test_pick_quote_is_a_verbatim_sentence_about_the_claim():
    text = ("Cookies help us. Active adults have a 20 to 35 percent lower risk of heart disease. "
            "Subscribe to our newsletter today.")
    q = pick_quote(text, "exercise cuts heart disease risk by 30 to 40 percent")
    assert q == "Active adults have a 20 to 35 percent lower risk of heart disease."
    assert q in text


def test_pick_quote_cuts_long_sentences_at_a_word_and_stays_verbatim():
    text = "word " * 200
    q = pick_quote(text, "word", max_chars=50)
    assert q in text and len(q) <= 50 and not q.endswith(" ")


def test_evidence_objects_carry_only_server_data():
    pack = EvidencePack.build("heart risk", web_docs=[{
        "content": "Active adults have a 20 to 35 percent lower risk of heart disease.",
        "source": "https://www.health-agency.example/facts", "metadata": {"title": "Facts"}}],
        kb_chunks=[{"chunk_index": 4, "text": "Library says 150 minutes a week helps the heart.", "score": 0.5}],
        kb_name="Notes")
    kb, web = (evidence_object(it, "heart risk") for it in pack.items)
    assert kb["source"]["kind"] == "kb" and kb["locator"] == "library 'Notes', chunk 4"
    assert web["source"]["domain"] == "health-agency.example" and web["quote"] in pack.items[1].text
    assert web["verifier_status"] == "pending" and "strength" not in web


def test_evidence_without_a_quotable_sentence_is_skipped():
    item = SimpleNamespace(text="   ", kind="web", evidence_id="e1")
    assert evidence_object(item, "q") is None


def test_source_span_exact_sentence_or_whole():
    text = "Exercise helps the heart. Just 10 minutes a day is enough."
    assert source_span(text, "Exercise helps the heart") == (0, 24)
    s, e = source_span(text, "just 10 minutes daily is enough")        # fuzzy match
    assert text[s:e] == "Just 10 minutes a day is enough"
    s, e = source_span(text, "enough: just 10 minutes each day")       # reordered → best sentence
    assert text[s:e] == "Just 10 minutes a day is enough."
    assert source_span(text, "Vitamin C prevents colds") == (0, len(text))


def test_word_spans_are_word_bounded():
    text = "All adults, and allies, should know all of it."
    assert word_spans(text, ["all"]) == [(0, 3), (36, 39)]

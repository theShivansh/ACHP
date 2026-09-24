"""
Public notes (06 §5): the one sentence per agent a non-expert reads.

`validate_note` is a pure function. A model-written `public_note` is used only if it is one short
plain sentence: at most 140 characters, no URL, no first-person process talk, no reasoning
narration, and no evidence reference that isn't already in the run's log. Anything else falls back
to the agent's deterministic template, which is built from counts the server computed itself.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional, Tuple

MAX_NOTE = 140

_URL = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(com|org|net|gov|edu|io|info)\b", re.I)
_PROCESS = re.compile(
    r"\blet me\b|\bI think\b|\bI believe\b|\bI will\b|\bI'll\b|\bI need to\b|\bI searched\b|\bI looked\b|"
    r"\bI checked\b|\bstep \d\b|\bfirst,? I\b|\breasoning\b|\bchain[- ]of[- ]thought\b|\bthinking\b|"
    r"\bhmm\b|\bwait,|\bas an ai\b|\blanguage model\b|<think>|\bscratchpad\b",
    re.I,
)
_EVIDENCE_REF = re.compile(r"\b(e\d+)\b", re.I)
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def clean_text(text: Optional[str]) -> str:
    return " ".join(_CONTROL.sub(" ", text or "").split())


def note_problem(note: Optional[str], known_evidence_ids: Iterable[str] = ()) -> Optional[str]:
    """Why a note can't be shown, or None if it can."""
    text = clean_text(note)
    if not text:
        return "empty"
    if len(text) > MAX_NOTE:
        return "too_long"
    if _URL.search(text):
        return "url"
    if _PROCESS.search(text):
        return "process_talk"
    known = {e.lower() for e in known_evidence_ids}
    for ref in _EVIDENCE_REF.findall(text):
        if ref.lower() not in known:
            return "unknown_evidence"
    if text.count(". ") >= 2:
        return "not_one_sentence"
    return None


def validate_note(note: Optional[str], fallback: str,
                  known_evidence_ids: Iterable[str] = ()) -> Tuple[str, str]:
    """(note, source): the cleaned model note with source "model", or the template with "template"."""
    if note_problem(note, known_evidence_ids) is None:
        return clean_text(note), "model"
    return clip(fallback), "template"


def clip(text: str, limit: int = MAX_NOTE) -> str:
    text = clean_text(text)
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def plural(n: int, word: str, many: Optional[str] = None) -> str:
    return f"{n} {word if n == 1 else (many or word + 's')}"


# ── Deterministic templates (06 §5) ──────────────────────────────────────────

def gatekeeper_note(safe: bool) -> str:
    return ("Checked for unsafe content and personal data. Safe to check." if safe
            else "Stopped before checking: this message can't be checked safely.")


def clipper_note(web: int, kb: int, other: int = 0, from_cache: bool = False) -> str:
    total = web + kb + other
    if total == 0:
        return "Found no sources for this claim."
    parts = []
    if web:
        parts.append(f"{web} from the web")
    if kb:
        parts.append(f"{kb} from your library")
    if other:
        parts.append(f"{other} from the text you added")
    tail = " (reused from a recent search)" if from_cache and web else ""
    return f"Pinned {plural(total, 'source')}: {', '.join(parts)}{tail}."


def decomposer_note(n: int) -> str:
    if n == 0:
        return "Found no checkable part in this message."
    return f"Cut the message into {plural(n, 'checkable part')}." if n > 1 else "Kept the message as one checkable part."


def fact_challenger_note(held: int, failed: int, open_: int) -> str:
    total = held + failed + open_
    if total == 0:
        return "Had no parts to check against the sources."
    bits = []
    if held:
        bits.append(f"{held} held up")
    if failed:
        bits.append(f"{failed} did not")
    if open_:
        bits.append(f"{open_} not settled by the sources")
    return f"Checked {plural(total, 'part')} against the sources: {', '.join(bits)}."


def narrative_auditor_note(missing: int) -> str:
    if missing == 0:
        return "Found no missing perspective that changes the picture."
    return f"Listed {plural(missing, 'missing perspective')} a reader should know about."


def framing_note(loaded: list[str], absolute: list[str]) -> str:
    if not loaded and not absolute:
        return "Mostly neutral wording."
    bits = []
    if loaded:
        bits.append(f"{plural(len(loaded), 'loaded word')} ('{loaded[0]}')")
    if absolute:
        bits.append(f"{plural(len(absolute), 'absolute term')} ('{absolute[0]}')")
    return clip("Wording check: " + "; ".join(bits) + ".")


_STAGE_WORDS = {
    "retriever": "source search", "proposer": "claim splitting", "analysis": "challenge",
    "judge": "judging", "config": "setup", "internal": "server", "server": "server",
}
_FAILURE_REASONS = {
    "overloaded": "too many checks are running right now",
    "auth": "the checker can't reach its language model service",
    "no_api_key": "the checker can't reach its language model service",
    "exhausted": "the language model service didn't answer in time",
    "injected_failure": "the fixture recorder stopped it on purpose",
    "internal_error": "something went wrong on the server",
    "server_restarted": "the server restarted",
    "cancelled": "the run was cancelled",
}


def failure_message(stage: str, code: str) -> str:
    """The user-facing sentence for run.failed / agent.failed. Provider errors, model ids and
    status codes stay in the server log; the log a reader sees says what failed, plainly."""
    step = _STAGE_WORDS.get(stage, stage.replace("_", " "))
    reason = _FAILURE_REASONS.get(code, "a service it depends on didn't answer")
    return f"The {step} step couldn't finish: {reason}, so no verdict was produced."


_LABEL_WORDS = {
    "supported": "supported", "contradicted": "contradicted", "mixed": "mixed",
    "missing_context": "missing context", "unverifiable": "not settled",
}


def judge_note(labels: list[str]) -> str:
    if not labels:
        return "No part could be rated."
    counts = {}
    for label in labels:
        counts[label] = counts.get(label, 0) + 1
    bits = [f"{n} {_LABEL_WORDS.get(k, k)}" for k, n in counts.items()]
    return clip(f"Rated {plural(len(labels), 'part')}: {', '.join(bits)}.")

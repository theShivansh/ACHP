"""A run's event log, read as a case: the same projection the case page makes, as plain data for an agent.

Pure functions only (no network), so they are tested against the recorded runs the web app ships.

The rules the site follows hold here too:
- Only what the events say. Nothing here invents progress, a label or a number.
- Show work, never thoughts: agent summaries and validated public notes, never a model's reasoning.
- No verdict without a real run: a failed run has no `verdict`; a blocked one says "Not checked" and has no scores.
- Truth first: the Judge's label is the headline. Scores carry their full names, and the overall score only ever
  appears next to the Judge's verdict, in the Assay's two-key comparison, as the server computed it.
"""
from __future__ import annotations

from typing import Any

# The five scores' full names (reference/assay/assay.py FULL_FORMS; a test pins them).
FULL_FORMS = {
    "CTS": "Consensus Truth Score",
    "PCS": "Perspective Completeness Score",
    "BIS": "Bias Impact Score",
    "NSS": "Narrative Stance Score",
    "EPS": "Epistemic Position Score",
}
LOWER_IS_BETTER = {"BIS"}

LABEL_WORDS = {
    "supported": "Supported",
    "contradicted": "Contradicted",
    "mixed": "Mixed",
    "missing_context": "Missing context",
    "unverifiable": "Unverifiable",
    "blocked": "Not checked",
}

TERMINAL = {"run.completed", "run.failed"}


def _by_type(events: list[dict], t: str) -> list[dict]:
    return [e for e in events if e.get("type") == t]


def _first(events: list[dict], t: str) -> dict | None:
    found = _by_type(events, t)
    return found[0] if found else None


def status_of(events: list[dict]) -> str:
    if _first(events, "run.failed"):
        return "failed"
    if _first(events, "run.completed"):
        return "completed"
    if _first(events, "run.started"):
        return "running"
    return "queued" if _first(events, "run.queued") else "unknown"


def progress_of(events: list[dict]) -> dict:
    """How far the run is, counted from agent events only (never a timer)."""
    started = _first(events, "run.started")
    agents = (started or {}).get("data", {}).get("agents", [])
    finished = {e.get("agent") for e in events if e.get("type") in ("agent.done", "agent.skipped", "agent.failed")}
    working = [e.get("agent") for e in events if e.get("type") == "agent.started" and e.get("agent") not in finished]
    names = {a["id"]: a.get("name", a["id"]) for a in agents}
    return {
        "agents_total": len(agents),
        "agents_finished": len([a for a in agents if a["id"] in finished]),
        "working": [names.get(a, a) for a in dict.fromkeys(working)],
    }


def summarize(run_id: str, events: list[dict], case_url: str | None = None) -> dict[str, Any]:
    """The case as data. Keys appear only when the log has what they describe."""
    status = status_of(events)
    out: dict[str, Any] = {"run_id": run_id, "status": status}
    if case_url:
        out["case_url"] = case_url

    started = _first(events, "run.started")
    if started:
        out["input"] = started["data"].get("input", {}).get("text")
        out["prompt_version"] = started["data"].get("prompt_version")

    if status in ("running", "queued", "unknown"):
        out["progress"] = progress_of(events)
        out["note"] = "The check is still running. No verdict exists yet; ask again with get_check."
        return out

    if status == "failed":
        f = _first(events, "run.failed")["data"]
        out["error"] = {
            "stage": f.get("stage"),
            "code": f.get("error_code") or f.get("code"),
            "message": f.get("message"),
            "retryable": f.get("retryable"),
        }
        out["note"] = "The check could not finish, so there is no verdict."
        return out

    verdict = _first(events, "verdict.final")
    if verdict is None:  # completed without a verdict is a broken log: say so, never guess one
        out["note"] = "The run completed but its log has no verdict."
        return out

    v = verdict["data"]
    overall = v.get("overall", {})
    label = overall.get("label")
    out["verdict"] = {
        "label": label,
        "label_words": LABEL_WORDS.get(label, label),
        "judge_verdict": overall.get("judge_verdict"),
        "summary": overall.get("summary"),
        "confidence_band": overall.get("confidence_band"),
        "confidence_reason": overall.get("confidence_reason"),
    }

    # Show the work: what each agent reported, in its own public words.
    agents = (started or {}).get("data", {}).get("agents", [])
    names = {a["id"]: a.get("name", a["id"]) for a in agents}
    notes: dict[str, list[str]] = {}
    for e in _by_type(events, "agent.note"):
        notes.setdefault(e.get("agent"), []).append(e["data"].get("note", ""))
    out["work"] = [
        {
            "agent": names.get(e.get("agent"), e.get("agent")),
            "summary": e["data"].get("summary"),
            "notes": notes.get(e.get("agent"), []),
        }
        for e in _by_type(events, "agent.done")
    ]

    if label == "blocked":
        out["blocked"] = {"reason": overall.get("summary") or "This message can't be checked safely."}
        out["note"] = "Not checked: only the Gatekeeper ran. There are no parts, sources or scores for a blocked message."
        return out

    parts_text = {e["data"]["claim"]["claim_id"]: e["data"]["claim"] for e in _by_type(events, "claim.extracted")}
    out["parts"] = [
        {
            "claim_id": c.get("claim_id"),
            "text": parts_text.get(c.get("claim_id"), {}).get("text"),
            "label": c.get("label"),
            "label_words": LABEL_WORDS.get(c.get("label"), c.get("label")),
            "confidence_band": c.get("confidence_band"),
            "confidence_reason": c.get("confidence_reason"),
            "evidence_for": c.get("evidence_for", []),
            "evidence_against": c.get("evidence_against", []),
        }
        for c in v.get("claims", [])
    ]

    out["evidence"] = []
    for e in _by_type(events, "evidence.found"):
        ev = e["data"]["evidence"]
        src = ev.get("source", {})
        out["evidence"].append({
            "evidence_id": ev.get("evidence_id"),
            "quote": ev.get("quote"),  # verbatim, as the server stored it
            "url": src.get("url"),
            "domain": src.get("domain"),
            "title": src.get("title"),
            "locator": ev.get("locator"),
            "kind": src.get("kind"),
        })

    out["wording"] = [
        {"signal": e["data"].get("signal"), "label": e["data"].get("label"), "explanation": e["data"].get("explanation")}
        for e in _by_type(events, "signal.computed")
    ]

    metrics = v.get("metrics") or {}
    if metrics:
        out["scores"] = {
            "note": "Instruments, not the verdict. The Judge's label above is the headline. Bias Impact Score: lower is better.",
            "items": [
                {"abbr": k, "name": FULL_FORMS[k], "value": metrics[k], "lower_is_better": k in LOWER_IS_BETTER}
                for k in FULL_FORMS
                if k in metrics
            ],
        }
        assay = _first(events, "assay.computed")
        if assay:
            a = assay["data"]
            tk = a.get("two_key") or {}
            out["scores"]["two_key"] = {
                "state": tk.get("state"),
                "judge": tk.get("judge"),
                "formula": tk.get("formula"),
                "overall_score": a.get("composite"),
                "sentence": _two_key_sentence(tk, a.get("composite")),
            }
            masking = a.get("masking") or {}
            if masking.get("masking"):
                out["scores"]["masking_notice"] = (
                    "The facts are weak (Consensus Truth Score under 0.40) but calm wording lifts the overall score. "
                    "Read the Judge's label, not the overall score."
                )

    done = _first(events, "run.completed")
    if done:
        out["timing"] = {"total_ms": done["data"].get("total_ms"), "from_cache": done["data"].get("cache_hit")}
    return out


def _two_key_sentence(tk: dict, composite: float | None) -> str | None:
    state = tk.get("state")
    j, f = tk.get("judge"), tk.get("formula")
    if state == "agree":
        return "Judge and formula agree."
    if state == "adjacent":
        return f"Close call: Judge {j} · Formula {f} ({composite})."
    if state == "split":
        return f"Split decision: Judge {j} · Formula {f}. See the ledger."
    return None


def as_markdown(case: dict) -> str:
    """A short, readable rendering of summarize()'s output, for hosts that show text."""
    lines: list[str] = []
    v = case.get("verdict")
    if case["status"] != "completed" or not v:
        lines.append(f"**{case['status'].capitalize()}.** {case.get('note', '')}".strip())
        if case.get("error"):
            lines.append(f"Stage: {case['error'].get('stage')} · {case['error'].get('message')}")
        return "\n".join(lines)
    lines.append(f"**{v['label_words']}** ({v.get('confidence_band')}): {v.get('summary')}")
    if case.get("blocked"):
        lines.append(case["note"])
        return "\n".join(lines)
    quotes = {e["evidence_id"]: e for e in case.get("evidence", [])}
    for p in case.get("parts", []):
        lines.append(f"- {p['label_words']}: {p.get('text')}")
        for eid in p.get("evidence_for", []) + p.get("evidence_against", []):
            q = quotes.get(eid)
            if q:
                lines.append(f"  - [{eid}] “{q.get('quote')}” ({q.get('domain')})")
    tk = (case.get("scores") or {}).get("two_key")
    if tk and tk.get("sentence"):
        lines.append(tk["sentence"])
    if case.get("case_url"):
        lines.append(f"Case: {case['case_url']}")
    return "\n".join(lines)

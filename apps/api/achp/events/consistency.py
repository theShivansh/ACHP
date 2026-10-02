"""The overall verdict and the part verdicts must tell the same story.

The Judge returns one overall verdict and one label per part in the same call, and the two can disagree: a run once
stamped a message "Unverifiable" while its first part was ruled Contradicted, so the headline hid a refuted claim.
This step runs once, right after the Judge, and only ever corrects a disagreement in the direction the cited evidence
supports. It is pure (no model, no I/O) and never invents a verdict:

  * A refuted part is never hidden: if any part is Contradicted, the overall cannot be Supported or Unverifiable.
  * Support is never over-stated: the overall is Supported only when every part is.
  * Falsity is never over-stated: the overall is Contradicted only when some part is, and Mixed with every part
    unsettled becomes Unverifiable.
  * A message with a single part shows one verdict on the same words: when the Judge's overall is decisive and the
    part's own cited sources lean the same way (two or more, and at least twice the other side), a part labelled
    Mixed takes the decisive label. Evidence ids that are not in the log never count.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence, Tuple

# Same table as achp.events.emitter.VERDICT_TO_LABEL (kept here so this module has no imports and is easy to test).
_LABEL = {
    "TRUE": "supported", "MOSTLY_TRUE": "supported", "MIXED": "mixed",
    "MOSTLY_FALSE": "contradicted", "FALSE": "contradicted",
    "UNVERIFIABLE": "unverifiable", "BLOCKED": "blocked",
}


def _legacy(label: str, previous: str) -> str:
    """The Judge's own word when it already fits the label, otherwise the milder word of the scale."""
    if label == "supported":
        return previous if previous in ("TRUE", "MOSTLY_TRUE") else "MOSTLY_TRUE"
    if label == "contradicted":
        return previous if previous in ("FALSE", "MOSTLY_FALSE") else "MOSTLY_FALSE"
    return {"mixed": "MIXED", "unverifiable": "UNVERIFIABLE"}[label]


def reconcile_judge(
    verdict: str,
    claims: Sequence[Dict[str, Any]],
    known_evidence: Iterable[str],
) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    """Return (verdict, claims, notes) with the overall and the parts in agreement. `notes` says what was changed."""
    overall = _LABEL.get(verdict)
    if overall in (None, "blocked") or not claims:
        return verdict, [dict(c) for c in claims], []

    known = set(known_evidence)
    fixed: List[Dict[str, Any]] = [dict(c) for c in claims]
    notes: List[str] = []

    # One part: the part and the overall are the same words, so they must not wear two different stamps.
    if len(fixed) == 1 and fixed[0].get("label") == "mixed" and overall in ("supported", "contradicted"):
        n_for = len([e for e in fixed[0].get("evidence_for", []) if e in known])
        n_against = len([e for e in fixed[0].get("evidence_against", []) if e in known])
        lean, other = (n_for, n_against) if overall == "supported" else (n_against, n_for)
        if lean >= 2 and lean >= 2 * other:
            fixed[0]["label"] = overall
            notes.append(f"the part leaned {overall} ({lean} sources to {other}), so it follows the overall")

    labels = [str(c.get("label", "unverifiable")) for c in fixed]
    has_contradicted = "contradicted" in labels
    all_contradicted = all(label == "contradicted" for label in labels)
    all_supported = all(label == "supported" for label in labels)
    all_unsettled = all(label == "unverifiable" for label in labels)

    new = overall
    if overall in ("supported", "unverifiable") and has_contradicted:
        new = "contradicted" if all_contradicted else "mixed"
    elif overall == "supported" and not all_supported:
        new = "unverifiable" if all_unsettled else "mixed"
    elif overall == "contradicted" and not has_contradicted:
        new = "unverifiable" if all_unsettled else "mixed"
    elif overall == "mixed" and all_unsettled:
        new = "unverifiable"

    if new != overall:
        notes.append(f"overall {overall} → {new} (parts: {', '.join(labels)})")
        verdict = _legacy(new, verdict)
    return verdict, fixed, notes

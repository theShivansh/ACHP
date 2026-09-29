"""
Confidence band (06 §3.1): a qualitative band with a stated reason, never a percentage.

Pure functions, derived only from things the run can show: how many sources the label cites, whether
cited sources point both ways, and whether the Fact Challenger reached the same finding
independently. Verifier acceptance joins the inputs once the evidence verifier exists (P8).

Per part
- unverifiable / blocked                                    → weak
- sources point both ways on a supported/contradicted label → weak
- ≥2 sources for the label and the challenger agrees        → strong
- ≥2 sources, or 1 source and the challenger agrees         → moderate
- otherwise                                                 → weak
Overall: the weakest band among the parts the Judge could rate, lowered one step when the Judge's
own confidence is below 0.5; unverifiable and blocked runs are weak.
"""
from __future__ import annotations

from typing import Iterable, List, Optional, Sequence, Tuple

Band = str  # "strong" | "moderate" | "weak"
_ORDER = {"weak": 0, "moderate": 1, "strong": 2}

# Which Fact Challenger verdicts agree with which Judge label.
_AGREES = {
    "supported": {"supported"},
    "contradicted": {"refuted"},
    "mixed": {"contested"},
    "missing_context": {"contested", "supported"},
}


def _n(k: int) -> str:
    return "one source" if k == 1 else f"{k} sources"


def claim_band(label: str, evidence_for: Sequence[str], evidence_against: Sequence[str],
               challenger_verdict: Optional[str]) -> Tuple[Band, str]:
    if label in ("unverifiable", "blocked"):
        return "weak", "No retrieved source settled this part."
    ids_for, ids_against = set(evidence_for), set(evidence_against)
    if label == "supported":
        n, conflict = len(ids_for), bool(ids_against)
    elif label == "contradicted":
        n, conflict = len(ids_against), bool(ids_for)
    else:
        n, conflict = len(ids_for | ids_against), False
    agrees = challenger_verdict in _AGREES.get(label, set())
    if conflict:
        return "weak", "The cited sources point in different directions."
    # For mixed and missing-context parts the sources are meant to differ, so "agree" would read as
    # backing the claim; say how many were cited and whether the challenger reached the same finding.
    said = "agree" if label in ("supported", "contradicted") else "cited"
    if n >= 2 and agrees:
        return "strong", f"{_n(n).capitalize()} {said} and the fact challenger reached the same finding."
    if n >= 2:
        return "moderate", f"{_n(n).capitalize()} {said}, but the fact challenger read it differently."
    if n == 1 and agrees:
        return "moderate", "One source, and the fact challenger reached the same finding."
    if n == 1:
        return "weak", "Rests on one source that the fact challenger read differently."
    return "weak", "No source was cited for this label."


def lower(band: Band) -> Band:
    return {"strong": "moderate", "moderate": "weak", "weak": "weak"}[band]


def overall_band(label: str, parts: Iterable[Tuple[str, Band, str]],
                 judge_confidence: float) -> Tuple[Band, str]:
    """`parts` = (label, band, reason) per part."""
    if label in ("unverifiable", "blocked"):
        return "weak", ("The message was not checked." if label == "blocked"
                        else "The sources found don't settle the claim.")
    rated: List[Tuple[str, Band, str]] = [p for p in parts if p[0] not in ("unverifiable", "blocked")]
    if not rated:
        return "weak", "No part could be rated from the sources."
    weakest = min(rated, key=lambda p: _ORDER[p[1]])
    band, reason = weakest[1], weakest[2]
    if len(rated) > 1 and band == "strong":
        reason = "Every rated part has two or more agreeing sources and the fact challenger agreed."
    elif len(rated) > 1:
        reason = f"Weakest part: {reason[0].lower()}{reason[1:]}"
    if judge_confidence < 0.5 and band != "weak":
        band = lower(band)
        reason = f"{reason} The judge was unsure, so the band is one step lower."
    return band, reason

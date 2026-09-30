"""Build the `assay.computed` payload from the pipeline's raw signals (06 §3.1, 11_THE_ASSAY.md).

Pure and synchronous (the ledger sums 2^13 coalitions: the caller runs it in a thread). It calls the
reference `assay()` and only trims what the event carries: the top 5 tipping-point flips, no leverage
table (the web computes leverage for the Lineage from the same formulas) and no agreement constants
(they live in the UI). Nothing here computes a metric.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from .core import Signals, assay

MAX_FLIPS = 5


def build_signals(*, factual_a: float, judge_cts: float, nil_bias: float, framing: float, polarity_abs: float,
                  dominant_frame: str, perspective_b: float, nil_pcs: float, missing: int, vader_eps: float,
                  hedge_ratio: float, judge_nss: Optional[float]) -> Signals:
    """The 13 raw signals (11 §1), in the pipeline's names. `a_narr` is derived in code mode, not passed."""
    return Signals(fA=factual_a, jCTS=judge_cts, s_nil=nil_bias, s_fr=framing, pol=polarity_abs,
                   frame=dominant_frame, fB=perspective_b, s_pcs=nil_pcs, n_miss=missing,
                   v_eps=vader_eps, hr=hedge_ratio, jNSS=judge_nss)


def assay_payload(signals: Signals, judge_verdict: str) -> Dict[str, Any]:
    a = assay(signals, judge_verdict, mode="code")
    tp = dict(a["tipping_point"])
    tp["flips"] = tp["flips"][:MAX_FLIPS]
    ledger = {k: a["ledger"][k] for k in ("mode", "opening_balance", "entries", "closing_balance", "check")}
    return {
        "formula_version": a["formula_version"],
        "mode": a["mode"],
        "signals": a["signals"],
        "metrics": a["metrics"],
        "composite": a["composite"],
        "formula_verdict": a["formula_verdict"],
        "judge_verdict": a["judge_verdict"],
        "two_key": a["two_key"],
        "ledger": ledger,
        "tipping_point": tp,
        "masking": a["masking"],
        "integrity_map": a["integrity_map"],
    }

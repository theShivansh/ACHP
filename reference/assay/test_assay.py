"""Tests for the ACHP Assay reference implementation. Run: python -m pytest -q reference/assay"""
import ast
import math
import os
import random
from dataclasses import replace
from pathlib import Path

import pytest

from assay import (FRAMES, REFERENCE, SAMPLES, PAPER_FIG9_METRICS, Signals, compute, features, from_metrics,
                   integrity_map_xy, ledger, leverage, lineage, masking, tipping_point, two_key, verdict_of)

rng = random.Random(7)


def rand_signals(mode="code"):
    s = Signals(fA=rng.random(), jCTS=rng.random(), s_nil=rng.random(), s_fr=rng.random(), pol=rng.random(),
                frame=rng.choice(FRAMES), fB=rng.random(), s_pcs=rng.random(), n_miss=rng.randint(0, 12),
                v_eps=rng.random(), hr=rng.random() * 0.4)
    if mode == "paper":
        s = replace(s, a_narr=rng.random(), jNSS=rng.random())
    elif rng.random() < 0.5:
        s = replace(s, jNSS=rng.random())
    return s


# ── Parity with the production formulas in apps/api (loaded by AST, so no heavy imports) ──
def _load_api_formulas():
    repo = Path(os.environ.get("ACHP_REPO", Path(__file__).resolve().parents[2]))
    src = repo / "apps/api/achp/core/core_pipeline.py"
    if not src.exists():
        return None
    tree = ast.parse(src.read_text(encoding="utf-8"))
    wanted = {"compute_CTS", "compute_PCS", "compute_BIS", "compute_NSS", "compute_EPS",
              "compute_composite", "verdict_from_composite", "NSS_proxy"}
    mod = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
    ns = {}
    exec(compile(mod, str(src), "exec"), ns)
    return ns if wanted <= ns.keys() else None


API = _load_api_formulas()


@pytest.mark.skipif(API is None, reason="set ACHP_REPO to the ACHP repo root to run parity tests")
def test_code_mode_matches_production_formulas():
    for _ in range(2000):
        s = rand_signals("code")
        bis = API["compute_BIS"](s.s_nil, s.s_fr, s.pol, s.frame)
        eps = API["compute_EPS"](s.v_eps, s.s_fr, s.hr)
        cts = API["compute_CTS"](s.fA, s.jCTS, bis, eps)
        pcs = API["compute_PCS"](s.fB, s.s_pcs, s.n_miss)
        jn = s.jNSS if s.jNSS is not None else API["NSS_proxy"](bis, s.s_fr)
        nss = API["compute_NSS"](s.s_fr, 1.0 - s.s_fr, jn)
        comp = API["compute_composite"](cts, pcs, bis, nss, eps)
        r = compute(s, "code")
        assert r["metrics"] == {"CTS": cts, "PCS": pcs, "BIS": bis, "NSS": nss, "EPS": eps}
        assert math.isclose(r["composite"], comp, abs_tol=1e-9)


# ── Verdict scale ──
@pytest.mark.parametrize("c,v", [(0.85, "TRUE"), (0.8499, "MOSTLY_TRUE"), (0.70, "MOSTLY_TRUE"), (0.6999, "MIXED"),
                                 (0.50, "MIXED"), (0.4999, "MOSTLY_FALSE"), (0.30, "MOSTLY_FALSE"), (0.2999, "FALSE"), (0.0, "FALSE")])
def test_verdict_scale(c, v):
    assert verdict_of(c) == v


# ── Integrity Ledger: double-entry must balance, dummies get zero ──
@pytest.mark.parametrize("mode", ["code", "paper"])
def test_ledger_balances(mode):
    for _ in range(60):
        s = rand_signals(mode)
        lg = ledger(s, mode)
        assert lg["check"] < 1e-9
        assert math.isclose(lg["opening_balance"] + sum(e["amount"] for e in lg["entries"]), lg["closing_balance"], abs_tol=1e-9)
        assert math.isclose(lg["closing_balance"], compute(s, mode)["composite"], abs_tol=2e-4)  # vs production C, which rounds each metric to 4 dp


def test_ledger_dummy_signal_is_zero():
    s = replace(REFERENCE, fA=0.9)          # only fA differs from the reference sheet
    lg = ledger(s, "paper")
    for e in lg["entries"]:
        if e["signal"] != "fA":
            assert abs(e["amount"]) < 1e-12
    assert math.isclose(next(e["amount"] for e in lg["entries"] if e["signal"] == "fA"), 0.4 * 0.4 / 5, abs_tol=1e-12)


# ── Tipping Point: the reported flip is real and minimal on the grid ──
@pytest.mark.parametrize("mode", ["code", "paper"])
def test_tipping_point_is_real_and_minimal(mode):
    for _ in range(25):
        s = rand_signals(mode)
        tp = tipping_point(s, mode)
        v0 = tp["verdict"]
        for f in tp["flips"]:
            if f["signal"] == "frame":
                continue
            assert verdict_of(compute(replace(s, **{f["signal"]: f["to"]}), mode)["composite"]) != v0
            if f["signal"] == "n_miss":
                continue
            # nothing strictly closer (by more than grid resolution) flips the verdict
            cur, d = f["from"], f["distance"]
            for k in range(1, 50):
                t = d * k / 50
                for cand in (cur - t, cur + t):
                    if 0 <= cand <= 1 and t < d - 2e-3:
                        assert verdict_of(compute(replace(s, **{f["signal"]: cand}), mode)["composite"]) == v0


def test_tipping_bands():
    assert tipping_point(SAMPLES["quiet_falsehood"][0])["band"] == "fragile"
    assert tipping_point(SAMPLES["exercise_mixed"][0])["band"] == "settled"


# ── Two-Key Verdict ──
def test_two_key_states():
    assert two_key("MIXED", "MIXED")["state"] == "agree"
    assert two_key("MOSTLY_FALSE", "MIXED")["state"] == "adjacent"
    assert two_key("FALSE", "MOSTLY_TRUE")["state"] == "split"
    assert two_key("UNVERIFIABLE", "MIXED")["state"] == "not_applicable"


def test_paper_fig9_is_a_two_key_disagreement():
    r = from_metrics(PAPER_FIG9_METRICS)          # BIS 42, CTS 52, PCS 51, NSS 75, EPS 30 (paper Fig. 9/11)
    assert math.isclose(r["composite"], 0.532, abs_tol=1e-9)
    assert r["formula_verdict"] == "MIXED"
    assert two_key("MOSTLY_FALSE", r["formula_verdict"])["state"] == "adjacent"   # the figure's Judge verdict


# ── Masking: a refuted claim in calm language gets lifted to a passing composite ──
def test_quiet_falsehood_is_flagged():
    s, judge = SAMPLES["quiet_falsehood"]
    r = compute(s)
    m = masking(r)
    assert r["metrics"]["CTS"] < 0.4 and r["formula_verdict"] in ("MIXED", "MOSTLY_TRUE", "TRUE")
    assert m["masking"] and m["quiet_falsehood"] and m["narrative_lift"] > 0.3
    assert integrity_map_xy(r)["quadrant"] == "quiet_falsehood"


def test_loud_falsehood_is_not_masking():
    m = masking(compute(SAMPLES["loud_falsehood"][0]))
    assert not m["masking"] and not m["quiet_falsehood"]


# ── Leverage: framing outweighs factual attack (analytical values) ──
def test_leverage_matches_closed_form():
    s = Signals(fA=0.5, jCTS=0.5, s_nil=0.4, s_fr=0.4, pol=0.4, frame="neutral", fB=0.5, s_pcs=0.5, n_miss=4,
                v_eps=0.5, hr=0.1)
    g = leverage(s, "code")["gradient"]
    assert math.isclose(g["fA"], 0.08, abs_tol=1e-6)
    assert math.isclose(g["s_fr"], -0.279, abs_tol=1e-6)        # code mode: framing enters NSS three times
    gp = leverage(replace(s, a_narr=0.5, jNSS=0.5), "paper")["gradient"]
    assert math.isclose(gp["s_fr"], -0.1815, abs_tol=1e-6)      # paper eq. (1)-(6)
    assert math.isclose(gp["v_eps"], 0.154, abs_tol=1e-6)


def test_lineage_framing_is_most_reused():
    assert lineage("code")["most_reused"] == "s_fr"
    assert lineage("code")["reaches"]["s_fr"] == ["BIS", "CTS", "EPS", "NSS"]
    assert "a_narr" not in lineage("code")["direct_paths"]


def test_features_by_mode():
    s = SAMPLES["exercise_mixed"][0]
    assert "a_narr" not in features("code", s) and "a_narr" in features("paper", s)

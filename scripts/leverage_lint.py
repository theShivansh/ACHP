#!/usr/bin/env python3
"""Leverage Lint: fail CI when a non-factual signal outweighs the factual attack by too much (11_THE_ASSAY.md §3.10).

Usage:  python leverage_lint.py [--mode code|paper] [--max-ratio 3.6] [--adr-dir docs/adr]
Exit 0 = pass, 1 = fail. An ADR file containing "leverage-ratio: <n>" raises the allowed ratio (documented decision).
"""
import argparse
import re
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
for _p in (_HERE, _HERE.parent / "reference" / "assay", Path.cwd() / "reference" / "assay"):
    if (_p / "assay.py").exists():  # works from reference/assay/ or when copied to scripts/
        sys.path.insert(0, str(_p))
        break

from assay import REFERENCE, Signals, leverage, replace  # noqa: E402

INTERIOR = replace(REFERENCE, s_nil=0.4, s_fr=0.4, pol=0.4, n_miss=4, hr=0.1)  # away from clamps and kinks
# Production usually has the Judge's NSS; --no-judge-nss models the NSS_proxy fallback path.


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="code", choices=["code", "paper"])
    ap.add_argument("--max-ratio", type=float, default=3.6)
    ap.add_argument("--adr-dir", default="docs/adr")
    ap.add_argument("--no-judge-nss", action="store_true")
    a = ap.parse_args()

    limit = a.max_ratio
    adr = Path(a.adr_dir)
    if adr.is_dir():
        for f in sorted(adr.glob("*.md")):
            m = re.search(r"leverage-ratio:\s*([0-9.]+)", f.read_text(encoding="utf-8"))
            if m:
                limit = max(limit, float(m.group(1)))
                print(f"ADR {f.name} allows leverage ratio {m.group(1)}")

    point = replace(INTERIOR, jNSS=None) if a.no_judge_nss and a.mode == "code" else INTERIOR
    g = leverage(point, a.mode)["gradient"]
    fa = abs(g["fA"])
    rows = sorted(((k, abs(v) / fa) for k, v in g.items() if k not in ("fA", "jCTS")), key=lambda r: -r[1])
    print(f"mode={a.mode}  |dC/dfA|={fa:.4f}  allowed ratio ≤ {limit}")
    worst = rows[0]
    for k, r in rows:
        flag = "  ✗" if r > limit else ""
        print(f"  {k:7s} {r:5.2f}× the factual attack{flag}")
    if worst[1] > limit:
        print(f"FAIL: {worst[0]} has {worst[1]:.2f}× the leverage of the factual attack (limit {limit}). "
              "Rebalance the formula or record the decision in an ADR with 'leverage-ratio: <n>'.")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
    sys.exit(main())

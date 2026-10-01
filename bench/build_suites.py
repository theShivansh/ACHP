"""Build the ACHP Bench suites that come from published data.

    python bench/build_suites.py --averitec path/to/averitec/dev.json

The AVeriTeC suite is a fixed, stratified sample of the AVeriTeC dev set (Schlichtkrull et al., NeurIPS 2023
Datasets and Benchmarks; https://github.com/MichSchli/AVeriTeC; CC BY-NC 4.0). Real claims, labelled by
professional fact-checkers with one of four labels. The sample is drawn with a fixed seed, so it is the same
every time; only the claim, its date, its gold label and the fact-check article's address are kept.

The other suites (safety, metamorphic, abstention) are written by hand in bench/suites/ and are not built here.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = 20261001
# How many of each gold label to draw (AVeriTeC dev holds 122 / 305 / 38 / 35).
STRATA = {
    "Supported": 40,
    "Refuted": 40,
    "Conflicting Evidence/Cherrypicking": 20,
    "Not Enough Evidence": 20,
}
# AVeriTeC's four labels, in ACHP's words.
GOLD = {
    "Supported": "supported",
    "Refuted": "contradicted",
    "Conflicting Evidence/Cherrypicking": "mixed",
    "Not Enough Evidence": "unverifiable",
}


def build_averitec(dev: list[dict]) -> list[dict]:
    rng = random.Random(SEED)
    out: list[dict] = []
    for label, n in STRATA.items():
        pool = [(i, x) for i, x in enumerate(dev) if x["label"] == label and len(x["claim"].strip()) >= 12]
        for i, x in sorted(rng.sample(pool, n), key=lambda p: p[0]):
            out.append({
                "id": f"averitec-dev-{i:03d}",
                "suite": "averitec",
                "text": x["claim"].strip(),
                "gold": GOLD[label],
                "gold_source_label": label,
                "claim_date": x.get("claim_date"),
                "fact_check_url": x.get("fact_checking_article"),
            })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--averitec", required=True, help="AVeriTeC data/dev.json")
    args = ap.parse_args()
    dev = json.loads(Path(args.averitec).read_text(encoding="utf-8"))
    rows = build_averitec(dev)
    dest = HERE / "suites" / "averitec.jsonl"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    print(f"wrote {len(rows)} claims to {dest.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()

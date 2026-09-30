#!/usr/bin/env python3
"""The three P5 test logs, built from the reference SAMPLES (11_THE_ASSAY.md §2.3, §2.4).

The live pipeline can't be told to produce a quiet falsehood, so these are SYNTHETIC: the shape of a
real run (from synthetic-mixed, itself produced by the real pipeline with a fake model) with the
verdict and the `assay.computed` readout replaced by the reference formulas applied to the sample's
signals. They are named `synthetic-*`, so the case bar, the OG image and the loader all label them
"test log, not a real check". Never used as a demo.

  python scripts/assay_fixtures.py
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from achp.assay.core import PAPER_FIG9_METRICS, SAMPLES, from_metrics, integrity_map_xy, masking, two_key  # noqa: E402
from achp.assay.emit import assay_payload  # noqa: E402
from achp.events.emitter import VERDICT_TO_LABEL  # noqa: E402

LOGS = ROOT / "apps" / "web" / "lib" / "runs" / "__tests__" / "logs"
SUMMARY = {
    "quiet-falsehood": "Synthetic log: the sources refute the claim, but its wording is calm.",
    "true-but-loaded": "Synthetic log: the sources back the claim, but its wording is loaded.",
    "paper-fig9-metrics": "Synthetic log: the five published figures from the paper's Fig. 9.",
    "loud-falsehood": "Synthetic log: the sources refute the claim and its wording is loaded.",
}


def readout(key: str):
    """(judge verdict, the assay.computed payload) for one sample."""
    sig, judge = SAMPLES[key]
    if sig is not None:
        return judge, assay_payload(sig, judge)
    r = from_metrics(PAPER_FIG9_METRICS)              # metrics only: no raw signals, so no ledger or tipping point
    return judge, {
        "formula_version": "achp-metrics/1.0", "mode": "metrics_only", "signals": {},
        "metrics": r["metrics"], "composite": r["composite"], "formula_verdict": r["formula_verdict"],
        "judge_verdict": judge, "two_key": two_key(judge, r["formula_verdict"]),
        "masking": masking(r), "integrity_map": integrity_map_xy(r),
    }


def build(name: str, sample: str) -> None:
    base = [json.loads(l) for l in (LOGS / "synthetic-mixed.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    judge, payload = readout(sample)
    label = VERDICT_TO_LABEL[judge]
    out = []
    for e in copy.deepcopy(base):
        e["run_id"] = f"r_synthetic_{name.replace('-', '_')}"
        if e["type"] == "verdict.final":
            d = e["data"]
            d["overall"].update(label=label, judge_verdict=judge, summary=SUMMARY[name])
            d["metrics"] = payload["metrics"]
            for c in d["claims"]:
                c["label"] = label
                c["evidence_for"], c["evidence_against"] = (["e1"], []) if label == "supported" else ([], ["e1"])
        if e["type"] == "claim.marked" and label == "supported" and e["data"].get("relation") == "contradicts":
            e["data"]["relation"] = "supports"      # no dissent left on a part the log now says is supported
            e["data"].pop("note", None)
        if e["type"] == "assay.computed":
            e["data"] = payload
        out.append(e)
    path = LOGS / f"synthetic-{name}.jsonl"
    path.write_text("".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) + "\n" for e in out),
                    encoding="utf-8", newline="\n")
    tk, mk = payload["two_key"]["state"], payload["masking"]
    print(f"{path.relative_to(ROOT)}  C={payload['composite']}  formula={payload['formula_verdict']}  judge={judge}  "
          f"two-key={tk}  masking={mk['masking']}  qfi={mk['qfi']}")


if __name__ == "__main__":
    build("quiet-falsehood", "quiet_falsehood")
    build("true-but-loaded", "true_but_loaded")
    build("paper-fig9-metrics", "paper_fig9")
    build("loud-falsehood", "loud_falsehood")

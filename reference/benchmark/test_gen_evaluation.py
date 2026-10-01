"""The benchmark the site shows is generated from data files (07 section 8, 01_AUDIT G5).

    python -m pytest -q reference/benchmark

A change to either source without regenerating EVALUATION.md and the web data fails here. So does a headline that is
not the measured ACHP Bench result, or an earlier figure that is presented as measured.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "gen_evaluation.py"


def _load():
    spec = importlib.util.spec_from_file_location("gen_evaluation", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_generated_files_are_current():
    mod = _load()
    data = mod.load()
    expected = {mod.MARKDOWN: mod.markdown(data), mod.WEB_JSON: json.dumps(mod.web(data), indent=2, ensure_ascii=False) + "\n"}
    for path, text in expected.items():
        assert path.exists(), f"{path.name} is missing; run python scripts/gen_evaluation.py"
        assert path.read_text(encoding="utf-8").replace("\r\n", "\n") == text, f"{path.name} is out of date; run python scripts/gen_evaluation.py"


def test_the_headline_is_the_measured_result_only_once_the_run_is_complete():
    mod = _load()
    d = mod.load()
    first = (ROOT / "EVALUATION.md").read_text(encoding="utf-8").split("\n\n")[1]
    web = json.loads(mod.WEB_JSON.read_text(encoding="utf-8"))
    if d["complete"]:
        acc = d["measured"]["suites"]["averitec"]["accuracy"]
        assert f"{acc['k']} of {acc['n']}" in first and "95% interval" in first and "Measured in this repository" in first
        assert web["measured"] is not None
    else:
        # A partial run (an outage, a quota) is never reported as the method's accuracy.
        assert "not been re-run" in first and "part-way through" in first
        assert web["measured"] is None and web["progress"]["planned"] > web["progress"]["with_verdict"]


def test_the_measured_result_is_what_the_scorer_computes_from_the_stored_logs():
    spec = importlib.util.spec_from_file_location("bench_score", ROOT / "bench" / "score.py")
    mod = importlib.util.module_from_spec(spec)
    import sys
    sys.modules["bench_score"] = mod
    spec.loader.exec_module(mod)
    latest = json.loads((ROOT / "bench" / "results" / "latest.json").read_text(encoding="utf-8"))
    assert mod.score(latest["tag"]) == latest, "bench/results/latest.json does not match its logs; run python bench/score.py --tag <tag>"


def test_earlier_figures_stay_labelled_and_are_never_averaged_in():
    data = json.loads((ROOT / "reference" / "benchmark" / "results.json").read_text(encoding="utf-8"))
    assert data["provenance"]["rerun_in_this_repo"] is False
    named = [s for s in data["systems"] if s["name"] == data["headline"]["system"]]
    assert len(named) == 1 and named[0]["scores"][-1] == data["headline"]["value"]
    md = (ROOT / "EVALUATION.md").read_text(encoding="utf-8")
    earlier = md.split("## Earlier figures (not re-run here)")
    assert len(earlier) == 2
    if _load().load()["complete"]:
        assert f"{data['headline']['value']:.1f}%" not in earlier[0], "an earlier figure appears in the measured part"

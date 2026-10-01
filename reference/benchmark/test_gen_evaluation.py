"""The benchmark the site shows is generated from one data file (07 section 8, 01_AUDIT G5).

    python -m pytest -q reference/benchmark

A change to results.json without regenerating EVALUATION.md and the web data fails here, and so does a headline that is
not the Macro score of the system it names.
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
    expected = {mod.MARKDOWN: mod.markdown(data), mod.WEB_JSON: json.dumps(data, indent=2, ensure_ascii=False) + "\n"}
    for path, text in expected.items():
        assert path.exists(), f"{path.name} is missing; run python scripts/gen_evaluation.py"
        assert path.read_text(encoding="utf-8").replace("\r\n", "\n") == text, f"{path.name} is out of date; run python scripts/gen_evaluation.py"


def test_the_headline_is_one_number_and_it_is_the_macro_score_of_the_named_system():
    data = json.loads((ROOT / "reference" / "benchmark" / "results.json").read_text(encoding="utf-8"))
    named = [s for s in data["systems"] if s["name"] == data["headline"]["system"]]
    assert len(named) == 1
    assert named[0]["scores"][-1] == data["headline"]["value"]
    assert data["split_columns"][-1] == "Macro"


def test_every_other_published_figure_is_named_and_none_is_averaged_in():
    data = json.loads((ROOT / "reference" / "benchmark" / "results.json").read_text(encoding="utf-8"))
    assert data["provenance"]["rerun_in_this_repo"] is False
    assert {o["label"] for o in data["other_published"]} >= {"Paper Table III per-benchmark mean"}


def test_markdown_leads_with_the_headline_the_case_page_reads():
    md = (ROOT / "EVALUATION.md").read_text(encoding="utf-8")
    first_paragraph = md.split("\n\n")[1]
    assert "68.3% macro accuracy" in first_paragraph

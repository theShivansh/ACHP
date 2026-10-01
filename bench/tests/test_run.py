"""The runner without a network: it stops when the model quota runs out, honours a daily cap, and resumes."""
from __future__ import annotations

import gzip
import importlib.util
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bench_run", HERE / "run.py")
R = importlib.util.module_from_spec(spec)
sys.modules["bench_run"] = R
spec.loader.exec_module(R)


@pytest.fixture
def fake(tmp_path, monkeypatch):
    monkeypatch.setattr(R, "HERE", tmp_path)
    (tmp_path / "suites").mkdir()
    rows = [{"id": f"x{i}", "suite": "safety", "text": f"claim number {i}", "gold": "blocked"} for i in range(10)]
    (tmp_path / "suites" / "safety.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    monkeypatch.setattr(R, "_req", lambda *a, **k: (200, {"status": "ok"}))
    state = {"calls": 0, "quota_from": 99}

    def check(api, text, timeout_s=300):
        state["calls"] += 1
        if state["calls"] >= state["quota_from"]:
            return {"status": "failed", "run_id": "r", "wall_ms": 1, "events": [{"type": "run.failed", "data": {"error_code": "exhausted"}}]}
        return {"status": "completed", "run_id": "r", "wall_ms": 1, "events": [{"type": "run.completed", "data": {}}]}

    monkeypatch.setattr(R, "check", check)
    return tmp_path, state


def run(monkeypatch, *argv):
    monkeypatch.setattr(sys, "argv", ["run.py", "--tag", "t", "--suites", "safety", *argv])
    R.main()


def stored(root: Path) -> dict[str, str]:
    return {p.name.split(".")[0]: json.loads(gzip.decompress(p.read_bytes()))["status"] for p in (root / "runs" / "t" / "safety").glob("*.json.gz")}


def test_it_stops_after_three_quota_failures_in_a_row(fake, monkeypatch, capsys):
    root, state = fake
    state["quota_from"] = 3
    run(monkeypatch)
    s = stored(root)
    assert list(s.values()).count("completed") == 2 and list(s.values()).count("failed") == 3
    assert len(s) == 5
    assert "stopped: 3 checks in a row failed because the model quota ran out" in capsys.readouterr().out


def test_a_daily_cap_and_a_resume_that_retries_only_what_failed(fake, monkeypatch):
    root, state = fake
    run(monkeypatch, "--max-checks", "4")
    assert len(stored(root)) == 4
    state["quota_from"] = 99
    run(monkeypatch, "--retry-failed")
    s = stored(root)
    assert len(s) == 10 and set(s.values()) == {"completed"}
    assert state["calls"] == 10  # the four finished ones were not checked again

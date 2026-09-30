"""Leverage lint (11 §3.10): tone must not outweigh the factual attack by more than the recorded ratio."""
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "leverage_lint.py"


@pytest.mark.skipif(not SCRIPT.exists(), reason="scripts/ is not in this checkout (an API-only deploy)")
@pytest.mark.parametrize("extra", [[], ["--no-judge-nss"]])
def test_leverage_lint_passes(extra):
    r = subprocess.run([sys.executable, str(SCRIPT), *extra], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stdout + r.stderr

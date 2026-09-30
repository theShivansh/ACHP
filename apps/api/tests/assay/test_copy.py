"""The API's Assay is the reference, unchanged; the parity test is not skipped; the Assay never forks."""
import filecmp
from pathlib import Path

import pytest

from achp.assay import core

REPO = Path(__file__).resolve().parents[4]
REFERENCE = REPO / "reference" / "assay" / "assay.py"


def test_core_is_a_byte_copy_of_the_reference():
    if not REFERENCE.exists():
        pytest.skip("the reference is not in this checkout (an API-only deploy)")
    assert filecmp.cmp(REFERENCE, Path(core.__file__), shallow=False), (
        "achp/assay/core.py differs from reference/assay/assay.py: change the reference, regenerate "
        "vectors.json, update both copies, bump FORMULA_VERSION and write an ADR (11_THE_ASSAY.md)")


def test_parity_with_production_formulas_actually_runs():
    from tests.assay import test_assay
    assert test_assay.API is not None, "ACHP_REPO must point at the repo root so the parity test runs, not skips"

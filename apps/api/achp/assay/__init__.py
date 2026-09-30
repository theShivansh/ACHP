"""The Assay (docs/upgrade/11_THE_ASSAY.md): metric instruments computed from the pipeline's raw signals.

`core.py` is a byte-for-byte copy of reference/assay/assay.py (tests/assay/test_copy.py enforces it). Change a
weight in the reference first, regenerate vectors.json, update both copies, bump FORMULA_VERSION, write an ADR.
"""
from .core import FORMULA_VERSION, HUMAN_AGREEMENT_R, Signals, assay, compute

__all__ = ["FORMULA_VERSION", "HUMAN_AGREEMENT_R", "Signals", "assay", "compute"]

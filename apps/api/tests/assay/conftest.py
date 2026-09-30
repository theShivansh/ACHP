"""Point the parity test at the repo root so it runs (the reference test skips without ACHP_REPO)."""
import os
from pathlib import Path

os.environ.setdefault("ACHP_REPO", str(Path(__file__).resolve().parents[4]))

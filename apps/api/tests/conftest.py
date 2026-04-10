"""
pytest conftest — ACHP Test Suite
Adds apps/api to sys.path so  `from achp.cache...` resolves correctly.
"""
import sys
from pathlib import Path

# Insert apps/api so imports work without install
API_ROOT = Path(__file__).resolve().parents[2]   # ACHP/apps/api
sys.path.insert(0, str(API_ROOT))

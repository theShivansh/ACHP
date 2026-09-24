"""
pytest conftest — ACHP Test Suite
Adds apps/api to sys.path so  `from achp.cache...` resolves correctly.
"""
import sys
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]   # ACHP/apps/api
sys.path.insert(0, str(API_ROOT))


@pytest.fixture(autouse=True)
def no_embedding_model(monkeypatch):
    # The NIL framing check falls back to its lexical path; tests don't download models.
    import achp.nil.nil_layer as nil_layer
    monkeypatch.setattr(nil_layer, "_get_encoder_singleton", lambda: None)
    monkeypatch.setattr(nil_layer, "_encoder_ok", False)


@pytest.fixture(autouse=True)
def isolated_event_bus():
    """Each test gets its own in-memory event store, never ./.data."""
    from achp.events import RunEventBus, SQLiteEventStore, set_bus
    bus = RunEventBus(SQLiteEventStore(":memory:"))
    set_bus(bus)
    yield bus
    set_bus(None)

"""/developers lists exactly what the server offers: the generated file must match a fresh read of the server."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


async def test_the_developers_page_manifest_is_current():
    spec = importlib.util.spec_from_file_location("gen_mcp_manifest", ROOT / "scripts" / "gen_mcp_manifest.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fresh = mod.render(await mod.manifest())
    stored = mod.OUT.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert stored == fresh, "apps/web/lib/mcp.generated.json is out of date; run python scripts/gen_mcp_manifest.py"

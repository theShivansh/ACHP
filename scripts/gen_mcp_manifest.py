"""Write what the ACHP MCP server really offers, as the /developers page shows it.

    python scripts/gen_mcp_manifest.py

The list comes from the server itself (an in-memory MCP client calls list_tools, list_resource_templates,
list_resources and list_prompts), so the page never describes a tool the server does not have.
apps/mcp/tests/test_manifest.py fails if the file is stale.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "mcp"))

OUT = ROOT / "apps" / "web" / "lib" / "mcp.generated.json"


async def manifest() -> dict:
    from fastmcp import Client

    from achp_mcp.server import create_server

    async with Client(create_server()) as c:
        tools = await c.list_tools()
        templates = await c.list_resource_templates()
        resources = await c.list_resources()
        prompts = await c.list_prompts()

    def params(schema: dict) -> list[dict]:
        req = set(schema.get("required", []))
        out = []
        for name, p in (schema.get("properties") or {}).items():
            if name == "ctx":
                continue
            kinds = [x.get("type") for x in p.get("anyOf", [])] if "anyOf" in p else [p.get("type")]
            out.append({
                "name": name,
                "type": " or ".join(k for k in kinds if k and k != "null") or "any",
                "required": name in req,
                "description": p.get("description", ""),
                **({"default": p["default"]} if "default" in p and p["default"] is not None else {}),
            })
        return out

    return {
        "server": "ACHP",
        "tools": [
            {
                "name": t.name,
                "title": t.title,
                "description": " ".join((t.description or "").split()),
                "read_only": bool(t.annotations and t.annotations.read_only_hint),
                "params": params(t.input_schema),
            }
            for t in tools
        ],
        "resources": sorted(
            [{"uri": t.uri_template, "title": t.title, "description": " ".join((t.description or "").split())} for t in templates]
            + [{"uri": str(r.uri), "title": r.title, "description": " ".join((r.description or "").split())} for r in resources],
            key=lambda r: r["uri"],
        ),
        "prompts": [
            {"name": p.name, "title": p.title, "description": " ".join((p.description or "").split()), "args": [a.name for a in (p.arguments or [])]}
            for p in prompts
        ],
    }


def render(m: dict) -> str:
    return json.dumps(m, indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    OUT.write_text(render(asyncio.run(manifest())), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

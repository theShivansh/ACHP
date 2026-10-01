"""ACHP as an MCP server (FastMCP).

    achp-mcp                                   # stdio, for Claude Desktop, Claude Code and other local hosts
    achp-mcp --transport http --port 8765      # streamable HTTP at http://127.0.0.1:8765/mcp

It talks to an ACHP backend over the public REST API (ACHP_API_URL, the hosted backend by default), so it needs no
model keys of its own and changes nothing on the server. A check started here is a real run: it shows up in the
backend's logs, and its case page is at ACHP_WEB_URL/case/<run_id> when ACHP_WEB_URL is set.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import time
from typing import Annotated, Any

from fastmcp import Context, FastMCP
from fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from .api import AchpApi, AchpApiError
from .case import FULL_FORMS, TERMINAL, as_markdown, progress_of, summarize

DEFAULT_API = "https://theshivansh-achp-api.hf.space"
MIN_CHARS = 12
MAX_CHARS = 10_000

INSTRUCTIONS = """\
ACHP checks a claim with seven agents (a Gatekeeper, a source finder, a part splitter, two challengers, a wording
check and a Judge) and returns the verdict with the evidence it rests on.

How to report a check to a person:
- Lead with the Judge's label and summary (verdict.label_words, verdict.summary). Never lead with a score.
- Quote evidence verbatim from `evidence[].quote` and name its source; do not paraphrase a quote as if it were one.
- "Unverifiable" means ACHP could not settle it, not that it is false. "Not checked" means the Gatekeeper blocked it.
- If a check failed or is still running there is no verdict: say so, and never guess one.
- Scores are instruments with full names (Consensus Truth Score, …); Bias Impact Score is lower-is-better.
"""


def _case_url(run_id: str) -> str | None:
    web = os.getenv("ACHP_WEB_URL", "").rstrip("/")
    return f"{web}/case/{run_id}" if web else None


def _check_text(text: str) -> str:
    t = text.strip()
    if len(t) < MIN_CHARS:
        raise ToolError(f"Give at least {MIN_CHARS} characters, so there is something to check.")
    if len(t) > MAX_CHARS:
        raise ToolError(f"That is too long to check at once. Keep it under {MAX_CHARS:,} characters.")
    return t


def create_server(api: AchpApi | None = None, *, poll_s: float = 1.5) -> FastMCP:
    api = api or AchpApi(os.getenv("ACHP_API_URL", DEFAULT_API))
    mcp = FastMCP(name="ACHP", instructions=INSTRUCTIONS, version="1.0.0")

    async def _guard(coro):
        try:
            return await coro
        except AchpApiError as e:
            if e.status == 404:
                raise ToolError(f"Not found: {e.detail}") from e
            raise ToolError(f"ACHP answered {e.status or 'nothing'}: {e.detail}") from e

    async def _follow(run_id: str, ctx: Context | None, wait_seconds: float) -> list[dict]:
        """Read the run's own log until it ends or the wait is over. Progress is counted from agent events."""
        events: list[dict] = []
        deadline = time.monotonic() + wait_seconds
        last_reported = -1
        while True:
            since = events[-1]["seq"] if events else 0
            events.extend(await _guard(api.events(run_id, since)))
            p = progress_of(events)
            if ctx is not None and p["agents_total"] and p["agents_finished"] != last_reported:
                last_reported = p["agents_finished"]
                working = ", ".join(p["working"]) or "finishing"
                await ctx.report_progress(p["agents_finished"], p["agents_total"], f"{working}")
            if any(e.get("type") in TERMINAL for e in events) or time.monotonic() >= deadline:
                return events
            await asyncio.sleep(poll_s)

    # ── Tools ────────────────────────────────────────────────────────────────────────────────────

    @mcp.tool(
        title="Check a claim",
        annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True),
        tags={"check"},
    )
    async def check_claim(
        text: Annotated[str, Field(description="The message or claim to check, as the person received it.")],
        library_id: Annotated[str | None, Field(description="Check against this library (from list_libraries) as well as the web.")] = None,
        wait_seconds: Annotated[int, Field(ge=5, le=600, description="How long to wait for the verdict before returning the run id.")] = 240,
        ctx: Context | None = None,
    ) -> dict[str, Any]:
        """Check a claim with ACHP's seven agents and return the verdict, each checkable part with its label, and the
        sources it rests on (verbatim quotes). Progress is reported as agents finish. If the run is not done within
        wait_seconds, the result has status "running" and no verdict; call get_check with the run_id later."""
        t = _check_text(text)
        created = await _guard(api.start_run(t, library_id))
        run_id = created["run_id"]
        events = await _follow(run_id, ctx, wait_seconds)
        case = summarize(run_id, events, _case_url(run_id))
        if case["status"] == "failed":
            err = case["error"]
            raise ToolError(f"The check could not finish ({err.get('stage')}: {err.get('message')}). No verdict was produced. Run id {run_id}.")
        case["readable"] = as_markdown(case)
        return case

    @mcp.tool(title="Start a check", annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True), tags={"check"})
    async def start_check(
        text: Annotated[str, Field(description="The message or claim to check.")],
        library_id: Annotated[str | None, Field(description="Optional library id.")] = None,
    ) -> dict[str, Any]:
        """Start a check and return its run id at once, without waiting. Read it later with get_check."""
        created = await _guard(api.start_run(_check_text(text), library_id))
        out = {"run_id": created["run_id"], "status": "running"}
        if url := _case_url(created["run_id"]):
            out["case_url"] = url
        return out

    @mcp.tool(title="Read a check", annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True), tags={"check"})
    async def get_check(run_id: Annotated[str, Field(description="A run id from check_claim or start_check.")]) -> dict[str, Any]:
        """Where a check stands. Finished: the verdict, parts and sources. Running: which agents are working, and no
        verdict. Failed: the stage and the reason, and no verdict."""
        events = await _guard(api.events(run_id))
        case = summarize(run_id, events, _case_url(run_id))
        case["readable"] = as_markdown(case)
        return case

    @mcp.tool(title="Read a check's event log", annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True), tags={"check"})
    async def get_check_events(
        run_id: Annotated[str, Field(description="The run id.")],
        since: Annotated[int, Field(ge=0, description="Only events after this sequence number.")] = 0,
        limit: Annotated[int, Field(ge=1, le=500, description="At most this many events.")] = 200,
    ) -> dict[str, Any]:
        """The run's raw event log (protocol v2): every agent action, public note, source, mark and the verdict, in
        order. It is what the case page is built from. It holds no model reasoning."""
        events = await _guard(api.events(run_id, since))
        return {"run_id": run_id, "events": events[:limit], "truncated": len(events) > limit}

    @mcp.tool(title="List libraries", annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True), tags={"library"})
    async def list_libraries() -> dict[str, Any]:
        """The libraries (uploaded documents) a check or a question can use, with their status and size."""
        kbs = await _guard(api.libraries())
        return {
            "libraries": [
                {k: kb.get(k) for k in ("kb_id", "name", "status", "doc_count", "chunk_count", "source_type", "source_name")}
                for kb in kbs
            ]
        }

    @mcp.tool(title="Ask a library", annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True), tags={"library"})
    async def ask_library(
        question: Annotated[str, Field(min_length=3, max_length=5000, description="The question.")],
        library_id: Annotated[str, Field(description="The library to answer from (list_libraries).")],
        top_k: Annotated[int, Field(ge=1, le=20, description="Passages to retrieve.")] = 6,
    ) -> dict[str, Any]:
        """Answer only from one library. Every sentence carries a [N] marker for a retrieved passage; an answer with no
        marker means the library does not say."""
        r = await _guard(api.ask(question, library_id, top_k))
        cited = "[" in (r.get("answer") or "")
        return {
            "answer": r.get("answer"),
            "in_library": cited,
            "passages": [{"n": i + 1, "chunk_index": c.get("chunk_index"), "excerpt": c.get("excerpt"), "similarity": c.get("score")} for i, c in enumerate(r.get("citations", []))],
            "library": {"id": r.get("kb_id"), "name": r.get("kb_name")},
            **({} if cited else {"note": "Not in this library. Try check_claim to check it against the web instead."}),
        }

    @mcp.tool(title="Search a library", annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True), tags={"library"})
    async def search_library(
        library_id: Annotated[str, Field(description="The library id.")],
        query: Annotated[str, Field(min_length=1, description="Words to look for in the stored passages.")],
        limit: Annotated[int, Field(ge=1, le=50)] = 10,
    ) -> dict[str, Any]:
        """Find stored passages in a library that contain the words, verbatim. A plain text match, not an answer."""
        body = await _guard(api.chunks(library_id))
        needle = query.lower()
        hits = [c for c in body.get("chunks", []) if needle in (c.get("text") or "").lower()]
        return {"library": body.get("name"), "matches": len(hits), "passages": [{"chunk_index": c.get("index"), "text": c.get("text")} for c in hits[:limit]]}

    @mcp.tool(title="Is ACHP awake", annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True), tags={"system"})
    async def backend_status() -> dict[str, Any]:
        """Whether the ACHP backend answers. A free-tier server can take up to a minute to wake after a quiet spell."""
        h = await _guard(api.health())
        return {"api": api.base_url, "status": h.get("status"), "pipeline_mode": h.get("pipeline_mode"), "libraries": h.get("kb_count")}

    # ── Resources ────────────────────────────────────────────────────────────────────────────────

    @mcp.resource("achp://runs/{run_id}/case", mime_type="text/markdown", title="A check, readable")
    async def case_resource(run_id: str) -> str:
        """A finished check as short Markdown: the verdict, each part and its quoted sources."""
        return as_markdown(summarize(run_id, await _guard(api.events(run_id)), _case_url(run_id)))

    @mcp.resource("achp://runs/{run_id}/events", mime_type="application/json", title="A check's event log")
    async def events_resource(run_id: str) -> dict:
        """The run's full event log (protocol v2)."""
        return {"run_id": run_id, "events": await _guard(api.events(run_id))}

    @mcp.resource("achp://method/scores", mime_type="application/json", title="What the scores mean")
    def scores_resource() -> dict:
        """The five scores' full names and how to read them. They are instruments, not the verdict."""
        return {
            "scores": [{"abbr": k, "name": v, "lower_is_better": k == "BIS"} for k, v in FULL_FORMS.items()],
            "rules": [
                "The Judge's label is the headline; a score is never reported alone.",
                "The overall score is only shown next to the Judge's verdict (the two-key comparison).",
                "Human agreement figures from the paper's calibration study are agreement, not accuracy.",
            ],
        }

    # ── Prompts ──────────────────────────────────────────────────────────────────────────────────

    @mcp.prompt(title="Check before forwarding")
    def check_before_forwarding(message: str) -> str:
        """Check a message someone wants to forward, and report it the way ACHP's site does."""
        return (
            "Use the ACHP check_claim tool on the message below. Then tell me, in plain words: the Judge's label and "
            "summary first; then each part with its label and one verbatim quote with its source; then anything ACHP "
            "could not settle. If the check failed or blocked the message, say so and give no verdict.\n\n"
            f"Message:\n{message}"
        )

    return mcp


def main() -> None:
    ap = argparse.ArgumentParser(prog="achp-mcp", description="ACHP as an MCP server")
    ap.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--api", default=None, help=f"ACHP backend (default: $ACHP_API_URL or {DEFAULT_API})")
    args = ap.parse_args()
    server = create_server(AchpApi(args.api or os.getenv("ACHP_API_URL", DEFAULT_API)))
    if args.transport == "http":
        server.run(transport="http", host=args.host, port=args.port, show_banner=False)
    else:
        server.run(show_banner=False)


if __name__ == "__main__":
    main()

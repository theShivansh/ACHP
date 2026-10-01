# ACHP MCP server

ACHP's claim checking as a [Model Context Protocol](https://modelcontextprotocol.io) server, built with
[FastMCP](https://gofastmcp.com). An agent can check a claim, read the verdict with its sources, and ask a library.

It talks to an ACHP backend over the public REST API, so it needs no model keys and changes nothing on the server.
Every check it starts is a real run, with a case page on the site.

## Install and connect

```bash
git clone https://github.com/theShivansh/ACHP.git
pip install -e ACHP/apps/mcp
```

Claude Code:

```bash
claude mcp add achp -e ACHP_API_URL=https://theshivansh-achp-api.hf.space -- achp-mcp
```

Claude Desktop, or any host with an `mcpServers` file:

```json
{ "mcpServers": { "achp": { "command": "achp-mcp", "env": { "ACHP_API_URL": "https://theshivansh-achp-api.hf.space" } } } }
```

As a web service (streamable HTTP at `http://127.0.0.1:8765/mcp`):

```bash
achp-mcp --transport http --port 8765
```

| Variable | Default | What it does |
|---|---|---|
| `ACHP_API_URL` | the hosted backend | The ACHP backend to use. |
| `ACHP_WEB_URL` | unset | When set, results carry `case_url` = `ACHP_WEB_URL/case/<run_id>`. |

## What it offers

Tools: `check_claim` (waits for the verdict and reports progress as agents finish), `start_check`, `get_check`,
`get_check_events`, `list_libraries`, `ask_library`, `search_library`, `backend_status`.
Resources: `achp://runs/{run_id}/case`, `achp://runs/{run_id}/events`, `achp://method/scores`.
Prompt: `check_before_forwarding`.

The site's rules hold here: the Judge's label leads; quotes are verbatim from the run's log; a failed check is an
error, never a verdict; a blocked message is "Not checked" with no scores; scores carry their full names; no model
reasoning is ever returned.

## Develop

```bash
cd apps/mcp && python -m pytest -q          # against a fake backend serving the recorded runs
python scripts/gen_mcp_manifest.py          # after changing a tool: refresh what /developers lists
```

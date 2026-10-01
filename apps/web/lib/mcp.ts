import manifest from './mcp.generated.json';

// The MCP server as /developers shows it. The tool list is generated from the server itself
// (scripts/gen_mcp_manifest.py, pinned by apps/mcp/tests/test_manifest.py); only the connection snippets are written here.

export type McpParam = { name: string; type: string; required: boolean; description: string; default?: unknown };
export type McpTool = { name: string; title: string | null; description: string; read_only: boolean; params: McpParam[] };
export type McpResource = { uri: string; title: string | null; description: string };
export type McpPrompt = { name: string; title: string | null; description: string; args: string[] };

export const MCP = manifest as { server: string; tools: McpTool[]; resources: McpResource[]; prompts: McpPrompt[] };

export const MCP_REPO = 'https://github.com/theShivansh/ACHP.git';

/** How to install and connect it, against the configured backend. */
export function mcpSetup(base: string): { title: string; note: string; code: string }[] {
  return [
    {
      title: 'Install it',
      note: 'From a checkout of the repository. It needs Python 3.10 or later, and no model keys: the backend does the checking.',
      code: `git clone ${MCP_REPO}
pip install -e ACHP/apps/mcp`,
    },
    {
      title: 'Add it to Claude Code',
      note: 'The server starts when the host needs it and talks over standard input and output.',
      code: `claude mcp add achp -e ACHP_API_URL=${base} -- achp-mcp`,
    },
    {
      title: 'Add it to Claude Desktop or another host',
      note: 'The same server in the usual mcpServers configuration file.',
      code: JSON.stringify({ mcpServers: { achp: { command: 'achp-mcp', env: { ACHP_API_URL: base } } } }, null, 2),
    },
    {
      title: 'Run it as a web service',
      note: 'Streamable HTTP for hosts that connect by address. It answers at http://127.0.0.1:8765/mcp.',
      code: `ACHP_API_URL=${base} achp-mcp --transport http --port 8765`,
    },
  ];
}

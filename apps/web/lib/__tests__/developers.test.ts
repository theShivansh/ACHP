import { describe, expect, it } from 'vitest';
import { EVENT_DOCS, restExamples, undocumented } from '../developers';
import { EVENT_TYPES } from '../runs/types';

describe('the developers page', () => {
  it('describes every event type of the protocol, and only those', () => {
    expect(undocumented()).toEqual([]);
    expect(Object.keys(EVENT_DOCS).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('writes its curl examples against the configured backend, over several lines', () => {
    const ex = restExamples('https://api.example');
    expect(ex.map((e) => e.title)).toContain('Start a check');
    for (const e of ex) {
      expect(e.code.startsWith('curl')).toBe(true);
      expect(e.code).toContain('https://api.example');
    }
    expect(ex[0].code.split('\n').length).toBeGreaterThan(1);
    expect(ex[0].code).toContain('\\\n');
  });
});

describe('the MCP tab', () => {
  it('lists the tools the server reports, and says which ones start a check', async () => {
    const { MCP } = await import('../mcp');
    expect(MCP.tools.map((t) => t.name)).toContain('check_claim');
    expect(MCP.tools.filter((t) => !t.read_only).map((t) => t.name).sort()).toEqual(['check_claim', 'start_check']);
    for (const t of MCP.tools) expect(t.description.length).toBeGreaterThan(20);
  });

  it('connects to the configured backend and never puts a key in the snippets', async () => {
    const { mcpSetup } = await import('../mcp');
    const s = mcpSetup('https://api.example');
    expect(s.filter((x) => x.code.includes('https://api.example')).length).toBe(3);
    for (const x of s) expect(x.code).not.toMatch(/GROQ|API_KEY|token/i);
    expect(JSON.parse(s[2].code).mcpServers.achp.command).toBe('achp-mcp');
  });
});

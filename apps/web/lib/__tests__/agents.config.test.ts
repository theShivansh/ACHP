import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentIdentities, agentIdentity, isKnownAgentId } from '../agents.config';

// The server's agent ids (04 §6, 06 §2) plus the two future agents.
const serverIds = [
  'security_validator',
  'retriever',
  'proposer',
  'adversary_a',
  'adversary_b',
  'nil_supervisor',
  'judge',
] as const;

describe('agent registry', () => {
  it('has an identity for every agent the server runs, plus the future verifier and media desk', () => {
    expect(Object.keys(agentIdentities).sort()).toEqual(
      [...serverIds, 'evidence_verifier', 'media_integrity'].sort(),
    );
  });

  it('matches the display names and inks of 04 §6', () => {
    expect(agentIdentity('adversary_a')).toMatchObject({ displayName: 'Fact Challenger', ink: 'pencil-red' });
    expect(agentIdentity('adversary_b')).toMatchObject({ displayName: 'Narrative Auditor', ink: 'pencil-blue' });
    expect(agentIdentity('judge')).toMatchObject({ displayName: 'Judge', ink: 'verdict', markKind: 'stamp' });
  });

  it('keeps the server name for an agent it does not know, with no marks', () => {
    expect(isKnownAgentId('fact_router')).toBe(false);
    expect(agentIdentity('fact_router', 'Fact Router')).toMatchObject({ displayName: 'Fact Router', markKind: 'none' });
  });

  it('names no model: models come from run.started.agents[] (S1.4)', () => {
    const src = readFileSync(path.resolve(__dirname, '../agents.config.ts'), 'utf8');
    expect(src).not.toMatch(/DeepSeek|Llama|Qwen|gpt-oss|OpenRouter|model:/i);
  });
});

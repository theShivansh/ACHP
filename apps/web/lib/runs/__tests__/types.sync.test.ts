import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  BANDS,
  EVENT_TYPES,
  isRunEvent,
  LABELS,
  RELATIONS,
  REQUIRED_FIELDS,
  SIGNALS,
  TERMINAL_TYPES,
} from '../types';
import { allLogs } from './load';

type Schema = Record<string, unknown> & {
  $defs: Record<string, { properties?: Record<string, SchemaNode>; required?: string[] }>;
  discriminator: { mapping: Record<string, string> };
  'x-event-types': string[];
  'x-terminal-types': string[];
};
type SchemaNode = { $ref?: string; enum?: string[]; anyOf?: SchemaNode[]; items?: SchemaNode };

const schema = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../../api/schemas/events.v2.json'), 'utf8'),
) as Schema;

const def = (ref: string) => schema.$defs[ref.split('/').pop()!];
const payloadDef = (type: string) => def(def(schema.discriminator.mapping[type]).properties!.data.$ref!);
const enumOf = (node: SchemaNode | undefined): string[] =>
  node?.enum ?? node?.anyOf?.flatMap((n) => enumOf(n)) ?? (node?.$ref ? enumOf(def(node.$ref) as SchemaNode) : []);

describe('lib/runs/types mirrors apps/api/schemas/events.v2.json', () => {
  it('has the same event types and terminal types', () => {
    expect([...EVENT_TYPES].sort()).toEqual([...schema['x-event-types']].sort());
    expect([...TERMINAL_TYPES].sort()).toEqual([...schema['x-terminal-types']].sort());
  });

  it('has the same required payload fields per type', () => {
    for (const t of EVENT_TYPES) {
      expect([...(payloadDef(t).required ?? [])].sort(), t).toEqual([...REQUIRED_FIELDS[t]].sort());
    }
  });

  it('has the same vocabularies', () => {
    const overall = def(payloadDef('verdict.final').properties!.overall.$ref!);
    expect(enumOf(overall.properties!.label).sort()).toEqual([...LABELS].sort());
    expect(enumOf(overall.properties!.confidence_band).sort()).toEqual([...BANDS].sort());
    expect(enumOf(payloadDef('claim.marked').properties!.relation).sort()).toEqual([...RELATIONS].sort());
    expect(enumOf(payloadDef('agent.action').properties!.action).sort()).toEqual([...ACTIONS].sort());
    expect(enumOf(payloadDef('signal.computed').properties!.signal).sort()).toEqual([...SIGNALS].sort());
  });

  it('accepts every event in every log and refuses non-envelopes', () => {
    for (const { name, events } of allLogs()) {
      for (const e of events) expect(isRunEvent(e), `${name} #${e.seq}`).toBe(true);
    }
    expect(isRunEvent({ v: 1, run_id: 'r', seq: 1, type: 'run.started', data: {} })).toBe(false);
    expect(isRunEvent({ v: 2, run_id: 'r', seq: 0, type: 'run.started', data: {} })).toBe(false);
    expect(isRunEvent({ v: 2, run_id: 'r', seq: 1, type: 'agent.thought', data: {} })).toBe(false);
  });
});

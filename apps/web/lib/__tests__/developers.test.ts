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

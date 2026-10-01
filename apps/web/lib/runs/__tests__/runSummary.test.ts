import { describe, expect, it } from 'vitest';
import { plotted, QUADRANT_WORDS, summarize } from '../runSummary';
import { log } from './load';

describe('a run as a row and a point', () => {
  it('reads the claim, the Judge label and the server Integrity Map point', () => {
    const s = summarize('r_x', log('quiet-falsehood'))!;
    expect(s.claim).toMatch(/exercise/i);
    expect(s.label).toBe('contradicted');
    expect(s.status).toBe('completed');
    expect(s.assay?.integrity_map.quadrant).toBe('quiet_falsehood');
    expect(s.startedAt).toBeGreaterThan(0);
  });

  it('puts the sample claims in their quadrants', () => {
    const q = (name: string) => summarize('r_x', log(name))?.assay?.integrity_map.quadrant;
    expect(q('loud-falsehood')).toBe('loud_falsehood');
    expect(q('true-but-loaded')).toBe('true_but_loaded');
    expect(Object.keys(QUADRANT_WORDS)).toHaveLength(4);
  });

  it('scores nothing for a blocked message', () => {
    const s = summarize('r_x', log('blocked'))!;
    expect(s.label).toBe('blocked');
    expect(s.assay).toBeNull();
  });

  it('has nothing to say about an empty log, and plots only scored runs', () => {
    expect(summarize('r_x', [])).toBeNull();
    const rows = [summarize('a', log('quiet-falsehood'))!, summarize('b', log('blocked'))!];
    expect(plotted(rows).map((r) => r.id)).toEqual(['a']);
  });
});

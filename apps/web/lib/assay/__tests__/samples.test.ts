import { describe, expect, it } from 'vitest';
import { compute } from '../assay';
import { BENCH_SAMPLES } from '../samples';
import vectors from '../vectors.json';

// The Bench samples on /method are the reference's own samples: the same signals, and the port computes the same
// scores the reference wrote into the parity vectors.

type Vector = { name: string; mode: string; metrics: Record<string, number>; composite: number };

describe('the Bench samples', () => {
  it('are the parity vectors cases, scored the way the reference scored them', () => {
    for (const s of BENCH_SAMPLES) {
      const name = s.id === 'reference' ? 'exercise_mixed' : s.id === 'sound' ? 'sound_true' : s.id;
      const v = (vectors.cases as Vector[]).find((c) => c.name === name && c.mode === 'code')!;
      const r = compute(s.signals, 'code');
      for (const m of ['CTS', 'PCS', 'BIS', 'NSS', 'EPS'] as const) expect(r.metrics[m]).toBeCloseTo(v.metrics[m], 3);
      expect(r.composite).toBeCloseTo(v.composite, 3);
    }
  });

  it('are labelled, and say what each shows', () => {
    expect(BENCH_SAMPLES.map((s) => s.label)).toEqual(['The reference claim', 'Sound', 'Quiet falsehood', 'True but loaded']);
    for (const s of BENCH_SAMPLES) expect(s.shows.length).toBeGreaterThan(20);
  });
});

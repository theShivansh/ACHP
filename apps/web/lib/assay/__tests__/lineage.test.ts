import { describe, expect, it } from 'vitest';
import { lineageEdges, lineageSignals, pathCounts, reaches } from '../lineage';

// The reference's lineage() (assay.py): code mode gives the framing score 4 direct paths (5 when the Judge
// omits its stance score); the paper's own equations give it 3. No other signal has more than one.

describe('signal lineage', () => {
  it('matches the reference: the framing score is the most reused signal in each mode', () => {
    expect(pathCounts(lineageEdges('paper')).s_fr).toBe(3);
    expect(pathCounts(lineageEdges('code')).s_fr).toBe(4);
    expect(pathCounts(lineageEdges('code', false)).s_fr).toBe(5);
    for (const [mode, judge] of [['paper', true], ['code', true], ['code', false]] as const) {
      const counts = pathCounts(lineageEdges(mode, judge));
      const others = Object.entries(counts).filter(([k]) => k !== 's_fr');
      expect(Math.max(...others.map(([, n]) => n))).toBe(1);
    }
  });

  it('reaches four metrics from the framing score, counting CTS through BIS and EPS', () => {
    expect(reaches(lineageEdges('code'), 's_fr')).toEqual(['CTS', 'BIS', 'NSS', 'EPS']);
    expect(reaches(lineageEdges('code'), 'fA')).toEqual(['CTS']);
  });

  it('has the paper equations’ weights: each metric’s inputs sum to 1', () => {
    for (const [mode, judge] of [['paper', true], ['code', true], ['code', false]] as const) {
      const edges = lineageEdges(mode, judge);
      for (const m of ['CTS', 'PCS', 'NSS', 'EPS']) {
        const sum = edges.filter((e) => e.to === m).reduce((t, e) => t + e.weight, 0);
        expect(sum).toBeCloseTo(1, 6);
      }
    }
  });

  it('lists 13 signals in the paper view and 12 (alignment is derived) in production', () => {
    expect(lineageSignals('paper')).toHaveLength(13);
    expect(lineageSignals('code')).toHaveLength(12);
    expect(lineageSignals('code', false)).toHaveLength(11);
  });
});

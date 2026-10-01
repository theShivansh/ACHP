import { describe, expect, it } from 'vitest';
import { metricLit, metricsOf, signalLit } from '../assayLink';

// The Hallmark ↔ Ledger ↔ Lineage link says which signals feed which score. It computes nothing; it reads the
// lineage table, which the Assay tests pin to the reference.

describe('Hallmark ↔ Ledger link', () => {
  it('knows which scores a signal feeds, including through BIS and EPS into CTS', () => {
    expect(metricsOf('fA')).toEqual(['CTS']);
    expect(metricsOf('s_nil')).toEqual(['CTS', 'BIS']);
    expect(metricsOf('s_fr')).toEqual(['CTS', 'BIS', 'NSS', 'EPS']); // the framing score is the most reused
    expect(metricsOf('fB')).toEqual(['PCS']);
  });

  it('hovering a mark lights the rows that fed it and no others', () => {
    const bis = { kind: 'metric', id: 'BIS' } as const;
    expect(signalLit(bis, 's_nil')).toBe('lit');
    expect(signalLit(bis, 'fA')).toBe('idle');
    expect(metricLit(bis, 'BIS')).toBe('active');
    expect(metricLit(bis, 'CTS')).toBe('idle');
  });

  it('hovering a row lights the marks it fed, and only that row is active', () => {
    const row = { kind: 'signal', id: 'fA' } as const;
    expect(metricLit(row, 'CTS')).toBe('lit');
    expect(metricLit(row, 'BIS')).toBe('idle');
    expect(signalLit(row, 'fA')).toBe('active');
    expect(signalLit(row, 's_nil')).toBe('idle');
  });

  it('nothing is lit when nothing is hovered', () => {
    expect(signalLit(null, 'fA')).toBe('idle');
    expect(metricLit(null, 'CTS')).toBe('idle');
  });
});

import { describe, expect, it } from 'vitest';
import { notSettledReading } from '../notSettled';
import type { AssayComputed } from '../runs/types';

const assay = (over: Partial<AssayComputed> & { BIS?: number; PCS?: number } = {}) =>
  ({
    formula_verdict: 'MIXED',
    metrics: { CTS: 0.5, PCS: over.PCS ?? 0.3, BIS: over.BIS ?? 0.1, NSS: 0.8, EPS: 0.5 },
    ...over,
  }) as unknown as AssayComputed;

describe('what a Not settled stamp can still say', () => {
  it('says unsettled is not false, always', () => {
    expect(notSettledReading({ verifiable: [true], sources: 0, assay: null }).lead).toBe('Not settled is not the same as false.');
  });

  it('names an opinion as an opinion, and never calls it true or false', () => {
    const r = notSettledReading({ verifiable: [false], sources: 5, assay: null });
    expect(r.why).toContain('opinion or a preference');
    expect(r.why).toContain('not a statement we can call true or false');
    expect(r.next).toContain('which models');
  });

  it('says plainly when no source was found, and when sources were found but none decides', () => {
    expect(notSettledReading({ verifiable: [true], sources: 0, assay: null }).why).toBe('We found no source that decides it.');
    expect(notSettledReading({ verifiable: [true], sources: 1, assay: null }).why).toBe('We found 1 source, but none decides it.');
    expect(notSettledReading({ verifiable: [true, true], sources: 5, assay: null }).why).toBe('We found 5 sources, but none decides it.');
  });

  it('splits a message that is part opinion and part checkable', () => {
    const r = notSettledReading({ verifiable: [true, false], sources: 3, assay: null });
    expect(r.why).toContain('Part of it is an opinion');
    expect(r.why).toContain('we found 3 sources, but none decides it.');
  });

  it("gives the Assay's closest reading as a hint with no number, and says it does not check facts", () => {
    const r = notSettledReading({ verifiable: [false], sources: 5, assay: assay({ BIS: 0.5, PCS: 0.28 }) });
    expect(r.scores).toContain('strongly slanted wording');
    expect(r.scores).toContain('other viewpoints left out');
    expect(r.scores).toContain('mixed');
    expect(r.scores).toContain('do not check facts');
    expect(r.scores).toContain('not a verdict');
    expect(r.scores).not.toMatch(/\d/);
  });

  it('has no scores line for a run without an Assay, or one that cannot lean either way', () => {
    expect(notSettledReading({ verifiable: [true], sources: 0, assay: null }).scores).toBeNull();
    expect(notSettledReading({ verifiable: [true], sources: 0, assay: assay({ formula_verdict: 'UNVERIFIABLE' }) }).scores).toBeNull();
  });

  it('describes calm wording and covered viewpoints too', () => {
    const r = notSettledReading({ verifiable: [true], sources: 2, assay: assay({ BIS: 0.05, PCS: 0.8 }) });
    expect(r.scores).toContain('calm wording');
    expect(r.scores).toContain('several viewpoints covered');
  });
});

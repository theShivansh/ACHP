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
    expect(r.next).toContain('by which measure');
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

  it('describes how the message is written from the Assay, with no number and no true-or-false lean', () => {
    const r = notSettledReading({ verifiable: [false], sources: 5, assay: assay({ BIS: 0.5, PCS: 0.28 }) });
    expect(r.scores).toContain('strongly slanted wording');
    expect(r.scores).toContain('other viewpoints left out');
    expect(r.scores).toContain('not whether it is true');
    expect(r.scores).toContain('do not change the stamp');
    expect(r.scores).not.toMatch(/\d/);
    expect(r.scores).not.toMatch(/mostly|false|mixed|reads? it as/i);
  });

  it('never leans a message true because its wording is calm (gibberish scored mostly true in a live run)', () => {
    const r = notSettledReading({ verifiable: [true], sources: 5, assay: assay({ formula_verdict: 'MOSTLY_TRUE', BIS: 0.004, PCS: 0.275 }) });
    expect(r.scores).toContain('calm wording');
    expect(r.scores).not.toMatch(/mostly true|reads? it as/i);
  });

  it('has no scores line for a run without an Assay', () => {
    expect(notSettledReading({ verifiable: [true], sources: 0, assay: null }).scores).toBeNull();
  });

  it('does not say viewpoints are covered when they are only partly covered (a reviewer may have said the opposite)', () => {
    const r = notSettledReading({ verifiable: [true], sources: 2, assay: assay({ BIS: 0.05, PCS: 0.55 }) });
    expect(r.scores).toContain('viewpoints only partly covered');
    expect(r.scores).not.toContain('several viewpoints covered');
  });

  it('describes calm wording and covered viewpoints too', () => {
    const r = notSettledReading({ verifiable: [true], sources: 2, assay: assay({ BIS: 0.05, PCS: 0.8 }) });
    expect(r.scores).toContain('calm wording');
    expect(r.scores).toContain('several viewpoints covered');
  });

  it('says what the search turned up, by title, and what each reviewer published', () => {
    const r = notSettledReading({
      verifiable: [true],
      sources: 3,
      assay: null,
      titles: ['IPL head to head records', 'CSK vs RCB head to head', 'Which is best, CSK or RCB?', 'A fourth page'],
      reviewers: [
        { who: 'Fact Challenger', said: 'It cannot be confirmed with the provided evidence.' },
        { who: 'Narrative Auditor', said: null },
      ],
    });
    expect(r.found).toBe('The search turned up pages such as “IPL head to head records”, “CSK vs RCB head to head” and “Which is best, CSK or RCB?”.');
    expect(r.reviewers).toEqual([{ who: 'Fact Challenger', said: 'It cannot be confirmed with the provided evidence.' }]);
  });

  it('has nothing to say about pages when the search found none', () => {
    expect(notSettledReading({ verifiable: [true], sources: 0, assay: null, titles: [] }).found).toBeNull();
  });
});

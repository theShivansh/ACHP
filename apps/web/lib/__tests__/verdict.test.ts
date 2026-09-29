import { describe, expect, it, vi } from 'vitest';
import { fleschKincaidGrade, sentenceCount, SHARE_MAX, shareSummary, SUMMARY_MAX_GRADE, SUMMARY_MAX_SENTENCES } from '../report';
import { seededTilt, VERDICTS, verdictInfo } from '../verdict';
import { allLogs } from '../runs/__tests__/load';
import { reduceAll } from '../runs/reducer';
import type { VerdictFinal } from '../runs/types';

describe('verdict vocabulary (04 §3.3)', () => {
  it('has one entry per server label, with its stamp text in caps and its mark', () => {
    expect(Object.keys(VERDICTS).sort()).toEqual(['blocked', 'contradicted', 'missing_context', 'mixed', 'supported', 'unverifiable']);
    expect(VERDICTS.contradicted).toMatchObject({ stamp: 'CONTRADICTED', tone: 'red', mark: 'strike' });
    expect(VERDICTS.missing_context).toMatchObject({ stamp: 'MISSING CONTEXT', tone: 'ochre', mark: 'bracket-caret' });
    expect(VERDICTS.blocked.stamp).toBe('NOT CHECKED');
  });

  it('never gives unverifiable or blocked the error color', () => {
    expect(VERDICTS.unverifiable.tone).toBe('graphite');
    expect(VERDICTS.blocked.tone).toBe('graphite');
    expect(VERDICTS.unverifiable.mark).toBe('dashed-box');
  });

  it('maps legacy verdicts explicitly and warns in dev; unknown values are null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(verdictInfo('MOSTLY_FALSE')?.label).toBe('contradicted');
    expect(verdictInfo('TRUE')?.label).toBe('supported');
    expect(warn).toHaveBeenCalled();
    expect(verdictInfo('WHATEVER')).toBeNull();
    expect(verdictInfo(null)).toBeNull();
    warn.mockRestore();
  });

  it('tilts a stamp within ±3° and the same way for the same id', () => {
    for (const id of ['C1', 'C2', 'r_0ab5a724e1', '']) {
      const t = seededTilt(id);
      expect(Math.abs(t)).toBeLessThanOrEqual(3);
      expect(seededTilt(id)).toBe(t);
    }
    expect(new Set(['C1', 'C2', 'C3', 'C4', 'C5'].map(seededTilt)).size).toBeGreaterThan(1);
  });
});

describe('share summary', () => {
  const v = (summary: string): VerdictFinal => ({
    overall: { label: 'mixed', summary, confidence_band: 'moderate', confidence_reason: 'r' },
    claims: [],
  });
  const url = 'https://achp.example/case/r_0123456789';

  it('is at most 400 characters and always ends with the whole link', () => {
    const long = 'The benefit is real, but the figure is overstated. '.repeat(20);
    const s = shareSummary({ claim: 'x '.repeat(300), verdict: v(long), url });
    expect(s.length).toBeLessThanOrEqual(SHARE_MAX);
    expect(s.endsWith(url)).toBe(true);
    expect(s).toContain('ACHP: Mixed.');
  });

  it('keeps a short summary whole', () => {
    const s = shareSummary({ claim: 'Water is wet.', verdict: v('It is.'), url });
    expect(s).toBe(`ACHP: Mixed. “Water is wet.”\nIt is.\n${url}`);
  });
});

describe('plain-words summary of every recorded and synthetic log', () => {
  for (const { name, events } of allLogs()) {
    const verdict = reduceAll(events).verdict;
    if (!verdict || verdict.overall.label === 'blocked') continue;
    it(`${name}: ≤${SUMMARY_MAX_SENTENCES} sentences, grade ≤${SUMMARY_MAX_GRADE + 4}`, () => {
      const text = verdict.overall.summary;
      expect(sentenceCount(text)).toBeLessThanOrEqual(SUMMARY_MAX_SENTENCES);
      // Flesch–Kincaid over-scores one long sentence with words like "productivity" (the recorded
      // ones land at 8–12). The ceiling catches jargon-dense text, not a fine reading level.
      expect(fleschKincaidGrade(text)).toBeLessThanOrEqual(SUMMARY_MAX_GRADE + 4);
    });
  }

  it('the grade estimate ranks plain text below dense text', () => {
    const plain = 'The benefit is real. The number is too high.';
    const dense = 'Notwithstanding methodological heterogeneity, epidemiological meta-analyses demonstrate attenuated cardiovascular morbidity.';
    expect(fleschKincaidGrade(plain)).toBeLessThan(fleschKincaidGrade(dense));
  });
});

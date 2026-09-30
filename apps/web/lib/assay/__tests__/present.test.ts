import { describe, expect, it } from 'vitest';
import { allLogs } from '@/lib/runs/__tests__/load';
import { initialRunState, reduceRun } from '@/lib/runs/reducer';
import type { AssayComputed } from '@/lib/runs/types';
import {
  fillLevel,
  ledgerGroups,
  ledgerSplit,
  maskingCopy,
  metricLabel,
  METRIC_INFO,
  METRICS,
  score100,
  tippingSentence,
  twoKeyCopy,
  verdictName,
} from '../present';

const assayOf = (name: string): AssayComputed => {
  const log = allLogs().find((l) => l.name === `synthetic/synthetic-${name}`)!;
  return log.events.reduce(reduceRun, initialRunState()).assay!;
};

describe('the Hallmark in numbers', () => {
  it('names each metric in full and says which way BIS reads', () => {
    expect(metricLabel('BIS', 0.2)).toBe('Bias Impact Score (BIS) · 20 · lower is better');
    expect(metricLabel('CTS', 0.61)).toBe('Consensus Truth Score (CTS) · 61');
    expect(METRICS.map((m) => METRIC_INFO[m].shape)).toEqual(['shield', 'hexagon', 'diamond', 'level', 'circle']);
  });

  it('draws the finer line for the least-agreed measures (r < 0.75) and the solid line for the rest', () => {
    expect(METRICS.filter((m) => METRIC_INFO[m].fine)).toEqual(['PCS', 'BIS', 'NSS']);
    expect(METRICS.filter((m) => !METRIC_INFO[m].fine)).toEqual(['CTS', 'EPS']);
  });

  it('fills to the value, clamped, and reads whole numbers', () => {
    expect([fillLevel(-0.2), fillLevel(0.42), fillLevel(1.4)]).toEqual([0, 0.42, 1]);
    expect(score100(0.615)).toBe(62);
  });
});

describe('Two-Key copy', () => {
  it('says agree, close call and split in the design words', () => {
    expect(twoKeyCopy({ state: 'agree', steps: 0, judge: 'MIXED', formula: 'MIXED' }, 0.6)?.text).toBe('Judge and formula agree');
    expect(twoKeyCopy({ state: 'adjacent', steps: 1, judge: 'MOSTLY_FALSE', formula: 'MIXED' }, 0.532)?.text).toBe(
      'Close call: Judge Mostly false · Formula Mixed (0.53)',
    );
    expect(twoKeyCopy({ state: 'split', steps: 2, judge: 'FALSE', formula: 'MOSTLY_TRUE' }, 0.72)?.text).toBe(
      'Split decision: Judge False · Formula Mostly true. See the ledger.',
    );
    expect(twoKeyCopy({ state: 'not_applicable', steps: null, judge: 'UNVERIFIABLE', formula: 'MIXED' }, 0.5)).toBeNull();
  });

  it('reads the three P5 test logs the way 11 §3 says', () => {
    const quiet = assayOf('quiet-falsehood');
    expect(twoKeyCopy(quiet.two_key, quiet.composite)?.state).toBe('split');
    const loaded = assayOf('true-but-loaded');
    expect(twoKeyCopy(loaded.two_key, loaded.composite)?.text).toContain('Split decision: Judge Mostly true · Formula Mostly false');
    const fig9 = assayOf('paper-fig9-metrics');
    expect(twoKeyCopy(fig9.two_key, fig9.composite)?.text).toBe('Close call: Judge Mostly false · Formula Mixed (0.53)');
  });
});

describe('masking', () => {
  it('fires for the quiet falsehood, with the composite named only inside the sentence', () => {
    const m = maskingCopy(assayOf('quiet-falsehood'))!;
    expect(m.lead).toBe("The wording is calm and balanced, but the facts didn't hold up.");
    expect(m.body).toBe('The overall score (0.72) is lifted by tone, not evidence.');
    expect(m.index).toMatch(/^Quiet Falsehood Index 0\.\d\d · experimental$/);
  });

  it('stays quiet when nothing was lifted', () => {
    expect(maskingCopy(assayOf('true-but-loaded'))).toBeNull();
    expect(maskingCopy(assayOf('paper-fig9-metrics'))).toBeNull();
  });
});

describe('the ledger', () => {
  it('balances: the opening balance plus every entry is the closing balance, which is the composite', () => {
    for (const name of ['quiet-falsehood', 'true-but-loaded', 'mixed']) {
      const a = assayOf(name);
      const lg = a.ledger!;
      const sum = lg.entries.reduce((t, e) => t + e.amount, 0);
      expect(Math.abs(lg.opening_balance + sum - lg.closing_balance)).toBeLessThan(1e-9);
      expect(Math.abs(lg.closing_balance - a.composite)).toBeLessThan(2e-4);
    }
  });

  it('puts the facts first and says what facts and wording each moved', () => {
    const lg = assayOf('quiet-falsehood').ledger!;
    const groups = ledgerGroups(lg.entries);
    expect(groups.map((g) => g.group)).toEqual(['Facts', 'Perspectives', 'Wording']);
    expect(groups[0].rows.map((r) => r.signal).sort()).toEqual(['fA', 'jCTS']);
    const { facts, other } = ledgerSplit(lg.entries);
    expect(facts).toBeLessThan(0); // the refuted facts cost score
    expect(other).toBeGreaterThan(0.1); // the calm wording earned it back
  });
});

describe('the tipping sentence', () => {
  it('names the lever, its move and where it lands, in signal units', () => {
    const a = assayOf('quiet-falsehood');
    const s = tippingSentence(a.tipping_point!);
    expect(a.tipping_point!.band).toBe('fragile');
    expect(s).toMatch(/^Fragile: if the .+ moved from \d\.\d\d to \d\.\d\d, the formula would read .+\.$/);
    expect(s).not.toContain('%');
  });

  it('says so when nothing is near', () => {
    const settled = assayOf('mixed').tipping_point!;
    expect(tippingSentence(settled)).toMatch(/^(Settled|Firm|Fragile): /);
  });
});

describe('verdict words', () => {
  it('reads the legacy scale in sentence case', () => {
    expect(['FALSE', 'MOSTLY_FALSE', 'MIXED', 'MOSTLY_TRUE', 'TRUE'].map(verdictName)).toEqual([
      'False',
      'Mostly false',
      'Mixed',
      'Mostly true',
      'True',
    ]);
  });
});

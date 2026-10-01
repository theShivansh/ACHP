import { describe, expect, it } from 'vitest';
import data from '../benchmark.generated.json';
import { findings, rateWords, type BenchmarkData, type Measured } from '../benchmark';

const b = data as BenchmarkData;

describe('the benchmark wording', () => {
  it('says a count before its rate and interval', () => {
    expect(rateWords({ k: 17, n: 28, rate: 0.6071, low: 0.4241, high: 0.7636 })).toBe('17 of 28 (60.7%; 95% interval 42.4% to 76.4%)');
    expect(rateWords({ k: 0, n: 0, rate: null, low: null, high: null })).toBe('none measured');
  });

  it('words every finding as a sentence with its count', () => {
    const r = (k: number, n: number) => ({ k, n, rate: n ? k / n : null, low: 0, high: 1 });
    const m = {
      tag: 't',
      api: null,
      formula_version: 'f',
      headline_sentence: 'Measured in this repository.',
      suites: {
        averitec: {
          n: 4,
          coverage: r(4, 4),
          accuracy: r(2, 4),
          accuracy_when_a_verdict_was_given: r(2, 4),
          accuracy_weighted_to_dev_mix: 0.5,
          macro_f1: { value: 0.4, low: 0.2, high: 0.6 },
          recall_by_gold_label: { supported: r(1, 1), contradicted: r(1, 1), mixed: r(0, 1), unverifiable: r(0, 1) },
          confusion: { supported: { supported: 1 }, contradicted: { contradicted: 1 }, mixed: { supported: 1 }, unverifiable: { supported: 1 } },
          true_false: { n: 2, decisive_error: r(0, 2), direction_accuracy_when_decided: r(2, 2) },
          baselines: { always_the_commonest_label_in_this_sample: 0.25, always_unverifiable: 0.25, uniform_random_expected: 0.25 },
          judge_vs_formula: { n: 4, judge_accuracy: r(2, 4), formula_accuracy: r(2, 4), two_key: { agree: 3 }, refuted_claims_the_masking_check_flags: 0 },
        },
      },
      grounding: { runs: 4, citations: 9, citations_to_a_source_not_in_the_log: 0, decisive_parts_with_a_cited_source: r(4, 4) },
      operations: { runs: 4, completed: 4, failed: 0, first_attempt_completed: r(4, 4), seconds_per_check_p50: 40, seconds_per_check_p90: 70, models: ['m'], prompt_versions: ['p'] },
    } satisfies Measured;
    const lines = findings(m);
    expect(lines.map((l) => l.id)).toEqual(expect.arrayContaining(['decisive', 'coverage', 'judge-formula', 'grounding', 'time']));
    for (const l of lines) {
      expect(l.text).toMatch(/[.]$/);
      expect(l.text).not.toMatch(/^\d+(\.\d+)?%$/);
    }
  });

  it('publishes measured results only when the run is complete, and keeps the earlier figures apart', () => {
    expect(b.earlier.headline.value).toBe(68.3);
    if (b.measured) {
      expect(JSON.stringify(b.measured)).not.toContain('68.3');
      expect(b.measured.headline_sentence).toContain('Measured in this repository');
    } else {
      expect(b.progress && b.progress.with_verdict < b.progress.planned).toBe(true);
    }
  });
});

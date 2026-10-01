// The benchmark as /method shows it. Every number comes from lib/benchmark.generated.json, which
// scripts/gen_evaluation.py writes from ACHP Bench's scored logs (bench/results/latest.json) and the earlier,
// not re-run figures (reference/benchmark/results.json). Nothing here writes a number by hand; it only words them.

export type Rate = { k: number; n: number; rate: number | null; low: number | null; high: number | null };

export const GOLD_CLASSES = ['supported', 'contradicted', 'mixed', 'unverifiable'] as const;
export type GoldClass = (typeof GOLD_CLASSES)[number];
export const PREDICTED = ['supported', 'contradicted', 'mixed', 'unverifiable', 'blocked', 'no_verdict'] as const;

/** The fact-checkers' words for their own labels (AVeriTeC), and ACHP's for its own. */
export const GOLD_WORDS: Record<GoldClass, string> = {
  supported: 'Supported',
  contradicted: 'Refuted',
  mixed: 'Conflicting or cherry-picked',
  unverifiable: 'Not enough evidence',
};
export const PREDICTED_WORDS: Record<(typeof PREDICTED)[number], string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  mixed: 'Mixed or missing context',
  unverifiable: 'Unverifiable',
  blocked: 'Not checked',
  no_verdict: 'No verdict',
};

export interface Measured {
  tag: string;
  api: string | null;
  formula_version: string;
  headline_sentence: string;
  suites: {
    averitec: {
      n: number;
      coverage: Rate;
      accuracy: Rate;
      accuracy_when_a_verdict_was_given: Rate;
      accuracy_weighted_to_dev_mix: number;
      macro_f1: { value: number; low: number; high: number };
      recall_by_gold_label: Record<GoldClass, Rate>;
      confusion: Record<GoldClass, Partial<Record<(typeof PREDICTED)[number], number>>>;
      true_false: { n: number; decisive_error: Rate; direction_accuracy_when_decided: Rate };
      baselines: { always_the_commonest_label_in_this_sample: number | null; always_unverifiable: number | null; uniform_random_expected: number };
      judge_vs_formula: { n: number; judge_accuracy: Rate; formula_accuracy: Rate; two_key: Record<string, number>; refuted_claims_the_masking_check_flags: number };
    };
    safety?: { injections_blocked: Rate; benign_wrongly_blocked: Rate };
    metamorphic?: { negation_flips_when_both_decided: Rate; paraphrase_same_label: Rate; paraphrase_same_label_without_cache: Rate; accuracy_on_settled_facts: Rate };
    abstention?: { said_unverifiable: Rate; strong_true_or_false: Rate };
  };
  grounding: { runs: number; citations: number; citations_to_a_source_not_in_the_log: number; decisive_parts_with_a_cited_source: Rate };
  operations: { runs: number; completed: number; failed: number; first_attempt_completed: Rate; seconds_per_check_p50: number | null; seconds_per_check_p90: number | null; models: string[]; prompt_versions: string[] };
}

export interface Earlier {
  provenance: { note: string };
  headline: { system: string; metric: string; value: number };
  split_columns: string[];
  systems: { name: string; scores: number[]; ours?: boolean }[];
  ablation: { configuration: string; macro: number }[];
  significance: string;
  other_published: { label: string; value: number; note: string }[];
}

/** measured is null until ACHP Bench is complete; progress then says how far it got. */
export interface BenchmarkData {
  measured: Measured | null;
  progress?: { tag: string; planned: number; with_verdict: number };
  earlier: Earlier;
}

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? 'n/a' : `${(100 * v).toFixed(digits)}%`);

/** "17 of 28 (60.7%; 95% interval 42.4% to 76.4%)" — a count first, then its rate and interval. */
export function rateWords(r: Rate): string {
  if (!r.n || r.rate == null) return 'none measured';
  return `${r.k} of ${r.n} (${pct(r.rate)}; 95% interval ${pct(r.low)} to ${pct(r.high)})`;
}

/** The lines under the headline, each a sentence with its count. Suites that were not run say nothing. */
export function findings(m: Measured): { id: string; text: string }[] {
  const a = m.suites.averitec;
  const out = [
    { id: 'decisive', text: `Of the claims labelled Supported or Refuted, ACHP called the opposite for ${rateWords(a.true_false.decisive_error)}.` },
    { id: 'coverage', text: `It gave a verdict for ${rateWords(a.coverage)}; the rest failed to finish and count as wrong.` },
    {
      id: 'judge-formula',
      text: `On the same claims, the Judge matched the fact-checkers for ${rateWords(a.judge_vs_formula.judge_accuracy)}, the formula for ${rateWords(a.judge_vs_formula.formula_accuracy)}. The formula cannot say “not enough evidence”.`,
    },
  ];
  const s = m.suites.safety;
  if (s) {
    out.push({ id: 'injections', text: `Prompt injections stopped by the Gatekeeper: ${rateWords(s.injections_blocked)}.` });
    out.push({ id: 'false-blocks', text: `Ordinary claims with words like “ignore” or “override” stopped by mistake: ${rateWords(s.benign_wrongly_blocked)}.` });
  }
  const mm = m.suites.metamorphic;
  if (mm) {
    out.push({ id: 'negation', text: `A claim and its negation got opposite verdicts in ${rateWords(mm.negation_flips_when_both_decided)} of the pairs where both were called true or false.` });
    out.push({ id: 'paraphrase', text: `Two wordings of one claim got the same verdict in ${rateWords(mm.paraphrase_same_label)}.` });
  }
  const ab = m.suites.abstention;
  if (ab) {
    out.push({ id: 'abstain', text: `Claims nobody can check (invented people, private events, the future) called Unverifiable: ${rateWords(ab.said_unverifiable)}.` });
  }
  const g = m.grounding;
  out.push({ id: 'grounding', text: `${g.citations} citations across ${g.runs} checks; ${g.citations_to_a_source_not_in_the_log} pointed to a source the run had not found.` });
  if (m.operations.seconds_per_check_p50 != null) {
    out.push({ id: 'time', text: `A check took ${m.operations.seconds_per_check_p50} seconds at the median and ${m.operations.seconds_per_check_p90} at the 90th percentile, on a free-tier server.` });
  }
  return out;
}

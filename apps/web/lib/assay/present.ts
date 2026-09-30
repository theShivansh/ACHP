// How the Assay reads in words (11_THE_ASSAY.md §3, 04 §7.1). Pure display helpers over the numbers the
// server computed (assay.computed); nothing here derives a metric. The reference math is in ./assay.ts
// (used only by the what-if Bench) and in apps/api/achp/assay (which the server runs).

import { FULL_FORMS, HUMAN_AGREEMENT_R, METRICS, VERDICT_ORDER, type MetricName } from './assay';
import type { AssayComputed, AssayLedgerEntry, AssayTippingPoint, AssayTwoKey } from '@/lib/runs/types';

export { FULL_FORMS, HUMAN_AGREEMENT_R, METRICS };
export type { MetricName };

export type CartoucheShape = 'shield' | 'hexagon' | 'diamond' | 'level' | 'circle';

export interface MetricInfo {
  code: MetricName;
  full: string;
  shape: CartoucheShape;
  /** What the score is about, in a line. */
  measures: string;
  /** BIS reads the other way round: more is worse (it enters the composite as 1 − BIS). */
  lowerIsBetter: boolean;
  /** Human agreement, Pearson r against 200 annotated claims (paper Fig. 13). */
  r: number;
  /** r < 0.75: the cartouche is drawn with the finer line (04 §7.1). */
  fine: boolean;
}

const MEASURES: Record<MetricName, string> = {
  CTS: 'how well the claim survives factual attack',
  PCS: 'how many relevant viewpoints it accounts for',
  BIS: 'how much loaded language and slant it carries',
  NSS: 'how neutral its narrative stance is',
  EPS: 'whether its certainty matches the evidence',
};
const SHAPES: Record<MetricName, CartoucheShape> = {
  CTS: 'shield',
  PCS: 'hexagon',
  BIS: 'diamond',
  NSS: 'level',
  EPS: 'circle',
};

export const METRIC_INFO: Record<MetricName, MetricInfo> = Object.fromEntries(
  METRICS.map((code) => [
    code,
    {
      code,
      full: FULL_FORMS[code],
      shape: SHAPES[code],
      measures: MEASURES[code],
      lowerIsBetter: code === 'BIS',
      r: HUMAN_AGREEMENT_R[code],
      fine: HUMAN_AGREEMENT_R[code] < 0.75,
    },
  ]),
) as Record<MetricName, MetricInfo>;

/** A score as the whole number people read (0.61 → 61). */
export const score100 = (v: number): number => Math.round(v * 100);

/** "Bias Impact Score (BIS) · 20 · lower is better": the Hallmark tooltip and its accessible name. */
export function metricLabel(code: MetricName, value: number): string {
  const m = METRIC_INFO[code];
  return `${m.full} (${code}) · ${score100(value)}${m.lowerIsBetter ? ' · lower is better' : ''}`;
}

/** The fill of a cartouche: the value, 0…1. BIS fills with bias (hatched), so its fill is the raw score. */
export function fillLevel(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ── Verdict words ─────────────────────────────────────────────────────────────

const VERDICT_NAMES: Record<string, string> = {
  FALSE: 'False',
  MOSTLY_FALSE: 'Mostly false',
  MIXED: 'Mixed',
  MOSTLY_TRUE: 'Mostly true',
  TRUE: 'True',
  UNVERIFIABLE: 'Not settled',
  BLOCKED: 'Not checked',
};

/** A legacy scale value in sentence case ("MOSTLY_FALSE" → "Mostly false"). */
export function verdictName(v: string): string {
  return VERDICT_NAMES[v] ?? v.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export const VERDICT_ZONES: { verdict: string; from: number; to: number }[] = [
  { verdict: 'FALSE', from: 0, to: 0.3 },
  { verdict: 'MOSTLY_FALSE', from: 0.3, to: 0.5 },
  { verdict: 'MIXED', from: 0.5, to: 0.7 },
  { verdict: 'MOSTLY_TRUE', from: 0.7, to: 0.85 },
  { verdict: 'TRUE', from: 0.85, to: 1 },
];

// ── Two-Key ───────────────────────────────────────────────────────────────────

export interface TwoKeyCopy {
  state: AssayTwoKey['state'];
  /** Both keys turn only when the Judge and the formula agree (or are one step apart). */
  text: string;
}

/** The Two-Key sentence (04 §7.1): agree · Close call · Split decision. `null` when not applicable. */
export function twoKeyCopy(tk: AssayTwoKey, composite: number): TwoKeyCopy | null {
  const judge = verdictName(tk.judge);
  const formula = verdictName(tk.formula);
  switch (tk.state) {
    case 'agree':
      return { state: 'agree', text: 'Judge and formula agree' };
    case 'adjacent':
      return { state: 'adjacent', text: `Close call: Judge ${judge} · Formula ${formula} (${composite.toFixed(2)})` };
    case 'split':
      return { state: 'split', text: `Split decision: Judge ${judge} · Formula ${formula}. See the ledger.` };
    default:
      return null;
  }
}

/** One calm line under a disagreement: which verdict stands (the Judge's stamp) and what the formula is. */
export const TWO_KEY_STANDS = "The stamp is the Judge's verdict. The formula is a second opinion, not the answer.";

// ── Masking ───────────────────────────────────────────────────────────────────

export interface MaskingCopy {
  lead: string;
  body: string;
  index: string;
}

/** The masking notice (Truth-first, 11 §4): the wording is calm, the facts didn't hold, the score is lifted by tone. */
export function maskingCopy(a: AssayComputed): MaskingCopy | null {
  if (!a.masking.masking) return null;
  return {
    lead: "The wording is calm and balanced, but the facts didn't hold up.",
    body: `The overall score (${a.composite.toFixed(2)}) is lifted by tone, not evidence.`,
    index: `Quiet Falsehood Index ${a.masking.qfi.toFixed(2)} (out of 1) · experimental`,
  };
}

// ── Signals in plain words, and the ledger's groups ───────────────────────────

export type SignalGroup = 'Facts' | 'Perspectives' | 'Wording';

const SIGNALS: Record<string, { words: string; group: SignalGroup }> = {
  fA: { words: 'Fact challenge score', group: 'Facts' },
  jCTS: { words: "Judge's fact score", group: 'Facts' },
  fB: { words: 'Perspective check score', group: 'Perspectives' },
  s_pcs: { words: 'Perspectives covered', group: 'Perspectives' },
  n_miss: { words: 'Missing perspectives', group: 'Perspectives' },
  s_nil: { words: 'Bias in the wording', group: 'Wording' },
  s_fr: { words: 'Framing of the wording', group: 'Wording' },
  pol: { words: 'Emotional charge', group: 'Wording' },
  frame: { words: 'Dominant frame', group: 'Wording' },
  v_eps: { words: 'Certainty of the language', group: 'Wording' },
  hr: { words: 'Hedging', group: 'Wording' },
  jNSS: { words: "Judge's stance score", group: 'Wording' },
  a_narr: { words: 'Narrative alignment', group: 'Wording' },
};

export const signalWords = (signal: string): string => SIGNALS[signal]?.words ?? signal;
export const signalGroup = (signal: string): SignalGroup => SIGNALS[signal]?.group ?? 'Wording';

/** A signal's value as printed: two decimals, a whole count, or the frame's name. */
export function signalValue(signal: string, value: number | string | null | undefined): string {
  if (value == null) return 'not given';
  if (typeof value === 'string') return value;
  return signal === 'n_miss' ? String(Math.round(value)) : value.toFixed(2);
}

export interface LedgerGroup {
  group: SignalGroup;
  rows: AssayLedgerEntry[];
}

const GROUP_ORDER: SignalGroup[] = ['Facts', 'Perspectives', 'Wording'];

/** Facts first, then Perspectives, then Wording; within a group the biggest movers first (as the server sorted them). */
export function ledgerGroups(entries: AssayLedgerEntry[]): LedgerGroup[] {
  return GROUP_ORDER.map((group) => ({ group, rows: entries.filter((e) => signalGroup(e.signal) === group) })).filter(
    (g) => g.rows.length > 0,
  );
}

/** What the facts moved the score by, and what the wording moved it by (the ledger's one-line summary). */
export function ledgerSplit(entries: AssayLedgerEntry[]): { facts: number; other: number } {
  let facts = 0;
  let other = 0;
  for (const e of entries) {
    if (signalGroup(e.signal) === 'Facts') facts += e.amount;
    else other += e.amount;
  }
  return { facts, other };
}

/** A signed amount. A plain hyphen-minus, which screen readers voice as "minus" (U+2212 is skipped by some). */
export const signed = (n: number, digits = 3): string => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(digits)}`;

// ── Tipping point ─────────────────────────────────────────────────────────────

const BAND_WORDS = { fragile: 'Fragile', firm: 'Firm', settled: 'Settled' } as const;
export const bandWord = (b: AssayTippingPoint['band']): string => BAND_WORDS[b];

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** The nearest flip on a continuous or count signal (a changed frame counts as a whole step away). */
export function nearestFlip(tp: AssayTippingPoint) {
  return tp.flips.find((f) => f.signal !== 'frame') ?? tp.flips[0] ?? null;
}

/**
 * "Fragile: if the framing of the wording were raised from 0.08 to 0.15, the formula would read Mixed."
 * One sentence, in signal units; it names the lever, never a percentage.
 */
export function tippingSentence(tp: AssayTippingPoint): string {
  const flip = nearestFlip(tp);
  const band = bandWord(tp.band);
  if (!flip) return `${band}: no single signal can change the formula's reading.`;
  const shown = (v: number | string) => (typeof v === 'number' ? signalValue(flip.signal, Math.round(v * 100) / 100) : `“${v}”`);
  const lever = lowerFirst(signalWords(flip.signal));
  const reads = verdictName(flip.new_verdict);
  if (flip.signal === 'frame') {
    const change = `the ${lever} were ${shown(flip.to)} rather than ${shown(flip.from)}`;
    return tp.band === 'settled'
      ? `${band}: the nearest change is if ${change}, which would read ${reads}.`
      : `${band}: if ${change}, the formula would read ${reads}.`;
  }
  const down = typeof flip.to === 'number' && typeof flip.from === 'number' && flip.to < flip.from;
  const move = `${lever} were ${down ? 'lowered' : 'raised'} from ${shown(flip.from)} to ${shown(flip.to)}`;
  return tp.band === 'settled'
    ? `${band}: no small change flips it. The nearest is if the ${move}, which would read ${reads}.`
    : `${band}: if the ${move}, the formula would read ${reads}.`;
}

/** Ordering helper for callers that compare verdicts on the scale. */
export const verdictRank = (v: string): number => VERDICT_ORDER.indexOf(v as (typeof VERDICT_ORDER)[number]);

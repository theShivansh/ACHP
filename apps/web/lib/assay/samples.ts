import vectors from './vectors.json';
import type { Signals } from './assay';

// The labelled samples on /method's Bench (07 §8): the reference claim and three sample claims, taken straight from the
// parity vectors (the same file the reference implementation and the port are tested against), so a sample here is the
// reference's own sample, not a retyped copy. Each one is a what-if: illustrative signals for an imagined check, never
// the result of a real one.

interface VectorCase {
  name: string;
  mode: string;
  signals: Signals;
  judge: string;
}

function sample(name: string): { signals: Signals; judge: string } {
  const c = (vectors.cases as VectorCase[]).find((v) => v.name === name && v.mode === 'code');
  if (!c) throw new Error(`parity vectors have no "${name}" case`);
  return { signals: c.signals, judge: c.judge };
}

export interface BenchSample {
  id: 'reference' | 'sound' | 'quiet_falsehood' | 'true_but_loaded';
  label: string;
  /** One line on what the sample shows. */
  shows: string;
  claim: string;
  signals: Signals;
  judge: string;
}

export const BENCH_SAMPLES: readonly BenchSample[] = [
  {
    id: 'reference',
    label: 'The reference claim',
    shows: 'A mixed case: some facts hold, one part is missing context.',
    claim: 'Regular exercise reduces the risk of heart disease by 30 to 40 percent, and just 10 minutes a day is enough.',
    ...sample('exercise_mixed'),
  },
  {
    id: 'sound',
    label: 'Sound',
    shows: 'Facts hold up and the wording is calm: the Judge and the formula agree.',
    claim: 'A claim the sources support, written plainly.',
    ...sample('sound_true'),
  },
  {
    id: 'quiet_falsehood',
    label: 'Quiet falsehood',
    shows: 'The facts are refuted, but the calm wording lifts the formula to Mostly true. The Judge says False.',
    claim: 'A refuted claim, written calmly.',
    ...sample('quiet_falsehood'),
  },
  {
    id: 'true_but_loaded',
    label: 'True but loaded',
    shows: 'The facts hold, but alarmed wording drags the formula down. The Judge says Mostly true.',
    claim: 'A supported claim, written in alarming words.',
    ...sample('true_but_loaded'),
  },
] as const;

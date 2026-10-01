// One stored run as a row on /runs and a point on the Integrity Map (07 §5, 11 §3.9). Everything comes from the run's
// own event log through the reducer: the claim, the Judge's label, and (when the Assay ran) the server's scores and
// its integrity_map point. Nothing is computed here, and a blocked message carries no scores at all.

import { initialRunState, reduceRun } from './reducer';
import type { AssayComputed, Label, RunEvent } from './types';

export type Quadrant = AssayComputed['integrity_map']['quadrant'];

export interface RunSummary {
  id: string;
  claim: string;
  /** The Judge's overall label, or null while the run has no verdict (running, failed). */
  label: Label | null;
  status: 'running' | 'completed' | 'failed';
  /** Epoch ms of run.started, or null. */
  startedAt: number | null;
  /** The server's scores; never present for a blocked message. */
  assay: AssayComputed | null;
}

export const QUADRANT_WORDS: Record<Quadrant, { name: string; hint: string }> = {
  sound: { name: 'Sound', hint: 'Facts hold up and the wording is calm.' },
  true_but_loaded: { name: 'True but loaded', hint: 'Facts hold up, but the wording is charged.' },
  quiet_falsehood: { name: 'Quiet falsehood', hint: 'The facts do not hold up, and the wording is calm. The one most likely to be forwarded.' },
  loud_falsehood: { name: 'Loud falsehood', hint: 'The facts do not hold up, and the wording is charged.' },
};

export function summarize(id: string, events: RunEvent[]): RunSummary | null {
  if (!events.length) return null;
  const state = events.reduce(reduceRun, initialRunState(events[0].run_id));
  const claim = state.input?.text;
  if (!claim) return null;
  const label = (state.verdict?.overall.label ?? null) as Label | null;
  const started = Date.parse(events[0].ts);
  return {
    id,
    claim,
    label,
    status: state.status === 'completed' ? 'completed' : state.status === 'failed' ? 'failed' : 'running',
    startedAt: Number.isFinite(started) ? started : null,
    assay: label === 'blocked' ? null : state.assay,
  };
}

/** The runs that can be drawn on the map: those the Assay scored. */
export function plotted(rows: RunSummary[]): (RunSummary & { assay: AssayComputed })[] {
  return rows.filter((r): r is RunSummary & { assay: AssayComputed } => !!r.assay);
}

/** CTS and Calm as the server computed them, on a 0..1 scale. */
export function pointOf(a: AssayComputed): { x: number; y: number; quadrant: Quadrant } {
  return a.integrity_map;
}

// Signal Lineage (11_THE_ASSAY.md §3.6): which raw signals feed which metrics, with the weight on each edge.
// A description of the published formulas (assay.py's docstring and equations (1)–(6)), used only to draw
// the diagram and its table twin. It computes nothing; tests pin its path counts to the reference's
// lineage() so the two can't drift. In the "production" view the code differs from the paper in one place:
// narrative alignment is 1 − framing, and a missing Judge stance score is estimated from BIS and framing.

import type { MetricName } from './assay';

export type LineageMode = 'paper' | 'code';

export interface Edge {
  from: string;
  to: string;
  /** The formula's weight on this edge (the frame's is its largest boost). */
  weight: number;
  /** A metric feeding a metric (BIS and EPS feed CTS) rather than a raw signal feeding one. */
  indirect?: boolean;
  /** How the edge is worded in the table twin, when it isn't a plain input. */
  via?: string;
}

const FRAMING = 's_fr';

/** Every edge of the lineage for one mode. `judgeNss` says whether the Judge gave its own stance score. */
export function lineageEdges(mode: LineageMode, judgeNss = true): Edge[] {
  const e: Edge[] = [
    { from: 's_nil', to: 'BIS', weight: 0.55 },
    { from: FRAMING, to: 'BIS', weight: 0.25 },
    { from: 'pol', to: 'BIS', weight: 0.12 },
    { from: 'frame', to: 'BIS', weight: 0.15 },
    { from: 'v_eps', to: 'EPS', weight: 0.7 },
    { from: FRAMING, to: 'EPS', weight: 0.2 },
    { from: 'hr', to: 'EPS', weight: 0.1 },
    { from: 'fA', to: 'CTS', weight: 0.4 },
    { from: 'jCTS', to: 'CTS', weight: 0.35 },
    { from: 'BIS', to: 'CTS', weight: 0.15, indirect: true, via: 'through the Bias Impact Score' },
    { from: 'EPS', to: 'CTS', weight: 0.1, indirect: true, via: 'through the Epistemic Position Score' },
    { from: 'fB', to: 'PCS', weight: 0.5 },
    { from: 's_pcs', to: 'PCS', weight: 0.3 },
    { from: 'n_miss', to: 'PCS', weight: 0.2 },
    { from: FRAMING, to: 'NSS', weight: 0.4 },
  ];
  if (mode === 'paper') {
    e.push({ from: 'a_narr', to: 'NSS', weight: 0.35 }, { from: 'jNSS', to: 'NSS', weight: 0.25 });
  } else {
    e.push({ from: FRAMING, to: 'NSS', weight: 0.35, via: 'as the alignment proxy (1 − framing)' });
    if (judgeNss) e.push({ from: 'jNSS', to: 'NSS', weight: 0.25 });
    else {
      // The Judge omitted its stance score: NSS_proxy = 1 − 0.6·BIS − 0.4·framing, weighted 0.25.
      e.push(
        { from: 'BIS', to: 'NSS', weight: 0.15, indirect: true, via: 'through the estimated stance score' },
        { from: FRAMING, to: 'NSS', weight: 0.1, via: 'through the estimated stance score' },
      );
    }
  }
  return e;
}

/** The raw signals of a mode, in the order the diagram lists them. */
export function lineageSignals(mode: LineageMode, judgeNss = true): string[] {
  const all = ['fA', 'jCTS', 'fB', 's_pcs', 'n_miss', 's_nil', 's_fr', 'pol', 'frame', 'v_eps', 'hr'];
  if (mode === 'paper') return [...all, 'a_narr', 'jNSS'];
  return judgeNss ? [...all, 'jNSS'] : all;
}

/** How many direct paths a raw signal takes into the five metrics (the framing score has the most). */
export function pathCounts(edges: Edge[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of edges) if (!x.indirect && x.from !== x.to) out[x.from] = (out[x.from] ?? 0) + 1;
  return out;
}

/** The metrics a signal reaches, counting the ones it reaches through BIS and EPS into CTS. */
export function reaches(edges: Edge[], signal: string): MetricName[] {
  const direct = new Set<string>(edges.filter((x) => !x.indirect && x.from === signal).map((x) => x.to));
  for (const mid of ['BIS', 'EPS']) if (direct.has(mid)) direct.add('CTS');
  return ['CTS', 'PCS', 'BIS', 'NSS', 'EPS'].filter((m) => direct.has(m)) as MetricName[];
}

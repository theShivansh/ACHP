'use client';

import { cn } from 'cn';
import type { MarkRect } from '@/lib/marks/measure';
import type { Label, Relation } from '@/lib/runs/types';

// Span marks v1 (S3.5). One absolutely positioned SVG per line rect over the strip text. The shape
// follows the relation (04 §3.3), the ink follows the agent that made the mark (04 §6):
//   contradicts → red underline (a challenger's finding), and a strike-through only once the
//     Judge has ruled the part Contradicted (the strike is the verdict's mark, 04 §3.3)
//   supports → underline · missing_context → brackets
//   framing → highlighter behind the words · unclear → dashed underline
// Drawn with a smooth stroke-dashoffset (--dur-base). P8 swaps this for stepped + boil. Reduced
// motion shows the finished mark (globals.css `.mark path`).

export type MarkInk = 'pencil-red' | 'pencil-blue' | 'ochre' | 'support' | 'graphite' | 'highlighter';

const STROKE: Record<MarkInk, string> = {
  'pencil-red': 'stroke-pencil-red',
  'pencil-blue': 'stroke-pencil-blue',
  ochre: 'stroke-ochre',
  support: 'stroke-support',
  graphite: 'stroke-graphite',
  highlighter: 'stroke-highlighter',
};

/**
 * The ink for a mark. Once the Judge has labelled the part, a challenger's red finding that the
 * ruling didn't uphold (anything but Contradicted) is kept in graphite: the finding stays visible,
 * but red, the error color, no longer contradicts the verdict.
 */
export function markInk(agent: string | null, relation: Relation, label: Label | null = null): MarkInk {
  const ink = baseInk(agent, relation);
  return ink === 'pencil-red' && label && label !== 'contradicted' ? 'graphite' : ink;
}

function baseInk(agent: string | null, relation: Relation): MarkInk {
  if (relation === 'framing' || agent === 'nil_supervisor') return 'highlighter';
  // Agreement is never drawn in a challenger's red or blue: red reads as a problem.
  if (relation === 'supports') return 'support';
  if (agent === 'adversary_a') return 'pencil-red';
  if (agent === 'adversary_b') return 'pencil-blue';
  switch (relation) {
    case 'contradicts':
      return 'pencil-red';
    case 'missing_context':
      return 'ochre';
    default:
      return 'graphite';
  }
}

function paths(relation: Relation, w: number, h: number, ruled: boolean, first: boolean, last: boolean): string[] {
  switch (relation) {
    case 'contradicts':
      return ruled ? [`M1 ${h * 0.56} L${w - 1} ${h * 0.5}`] : [`M1 ${h - 2} L${w - 1} ${h - 2.5}`];
    case 'supports':
      return [`M1 ${h - 2} L${w - 1} ${h - 2.5}`];
    case 'missing_context':
      // Brackets open on the span's first line and close on its last, like a pencil would. They
      // sit in the gutter outside the words (the svg is widened by BRACKET_PAD on each side), so
      // no letter is ever drawn over.
      return [
        ...(first ? [`M5 1 L1.5 1 L1.5 ${h - 1} L5 ${h - 1}`] : []),
        ...(last ? [`M${w - 5} 1 L${w - 1.5} 1 L${w - 1.5} ${h - 1} L${w - 5} ${h - 1}`] : []),
      ];
    case 'framing':
      return [`M0 ${h * 0.55} L${w} ${h * 0.55}`];
    default:
      return [`M1 ${h - 2} L${w - 1} ${h - 2}`];
  }
}

/** How far outside the words a bracket sits (px). */
const BRACKET_PAD = 6;

export function Mark({
  rect,
  relation,
  ink,
  line,
  span,
  ruled = false,
  first = true,
  last = true,
}: {
  rect: MarkRect;
  /** The [start, end) characters this mark covers (kept on the element for tests and tooling). */
  span: readonly [number, number];
  relation: Relation;
  ink: MarkInk;
  /** Which line of a wrapped span (later lines start a little later, like a hand moving on). */
  line: number;
  /** The Judge ruled this part Contradicted (verdict.final): a contradicts mark becomes a strike. */
  ruled?: boolean;
  /** This rect is the span's first / last line (a wrapped span has several). */
  first?: boolean;
  last?: boolean;
}) {
  const pad = relation === 'missing_context' ? BRACKET_PAD : 0;
  const w = Math.max(4, rect.width) + pad * 2;
  const h = Math.max(4, rect.height);
  const highlight = relation === 'framing';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn('mark pointer-events-none absolute overflow-visible', highlight && 'mix-blend-(--highlighter-blend)')}
      data-relation={relation}
      data-ruled={ruled || undefined}
      data-span={`${span[0]},${span[1]}`}
      data-mark-rect={`${rect.x},${rect.y},${rect.width},${rect.height}`}
      data-pad={pad || undefined}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ '--x': `${rect.x - pad}px`, '--y': `${rect.y}px`, '--delay': `${line * 120}ms` } as React.CSSProperties}
    >
      {paths(relation, w, h, ruled, first, last).map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={relation === 'unclear' ? undefined : 1}
          className={cn(
            STROKE[ink],
            highlight ? 'opacity-(--highlighter-opacity)' : '',
            relation === 'unclear' && '[stroke-dasharray:0.03_0.03]',
          )}
          strokeWidth={highlight ? h * 0.8 : 1.75}
        />
      ))}
    </svg>
  );
}

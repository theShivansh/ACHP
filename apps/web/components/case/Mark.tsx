'use client';

import { cn } from 'cn';
import type { MarkRect } from '@/lib/marks/measure';
import type { Relation } from '@/lib/runs/types';

// Span marks v1 (S3.5). One absolutely positioned SVG per line rect over the strip text. The shape
// follows the relation (04 §3.3), the ink follows the agent that made the mark (04 §6):
//   contradicts → strike-through · supports → underline · missing_context → brackets
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

export function markInk(agent: string | null, relation: Relation): MarkInk {
  if (relation === 'framing' || agent === 'nil_supervisor') return 'highlighter';
  if (agent === 'adversary_a') return 'pencil-red';
  if (agent === 'adversary_b') return 'pencil-blue';
  switch (relation) {
    case 'contradicts':
      return 'pencil-red';
    case 'supports':
      return 'support';
    case 'missing_context':
      return 'ochre';
    default:
      return 'graphite';
  }
}

function paths(relation: Relation, w: number, h: number): string[] {
  switch (relation) {
    case 'contradicts':
      return [`M1 ${h * 0.56} L${w - 1} ${h * 0.5}`];
    case 'supports':
      return [`M1 ${h - 2} L${w - 1} ${h - 2.5}`];
    case 'missing_context':
      return [`M6 1 L2 1 L2 ${h - 1} L6 ${h - 1}`, `M${w - 6} 1 L${w - 2} 1 L${w - 2} ${h - 1} L${w - 6} ${h - 1}`];
    case 'framing':
      return [`M0 ${h * 0.55} L${w} ${h * 0.55}`];
    default:
      return [`M1 ${h - 2} L${w - 1} ${h - 2}`];
  }
}

export function Mark({
  rect,
  relation,
  ink,
  line,
  span,
}: {
  rect: MarkRect;
  /** The [start, end) characters this mark covers (kept on the element for tests and tooling). */
  span: readonly [number, number];
  relation: Relation;
  ink: MarkInk;
  /** Which line of a wrapped span (later lines start a little later, like a hand moving on). */
  line: number;
}) {
  const w = Math.max(4, rect.width);
  const h = Math.max(4, rect.height);
  const highlight = relation === 'framing';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn('mark pointer-events-none absolute overflow-visible', highlight && 'mix-blend-(--highlighter-blend)')}
      data-relation={relation}
      data-span={`${span[0]},${span[1]}`}
      data-mark-rect={`${rect.x},${rect.y},${rect.width},${rect.height}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ '--x': `${rect.x}px`, '--y': `${rect.y}px`, '--delay': `${line * 120}ms` } as React.CSSProperties}
    >
      {paths(relation, w, h).map((d, i) => (
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

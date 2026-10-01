'use client';

import { cn } from 'cn';
import { MARK_FRAMES, seededRandom, wobbleOf, type MarkStroke } from '@/lib/handdrawn';
import type { MarkRect } from '@/lib/marks/measure';
import { useContext } from 'react';
import { LaneFx } from './AgentLane';
import { useBoilSlot, usePlayOnce } from './arrival';
import type { Label, Relation } from '@/lib/runs/types';

// Span marks v1 (S3.5). One absolutely positioned SVG per line rect over the strip text. The shape
// follows the relation (04 §3.3), the ink follows the agent that made the mark (04 §6):
//   contradicts → red underline (a challenger's finding), and a strike-through only once the
//     Judge has ruled the part Contradicted (the strike is the verdict's mark, 04 §3.3)
//   supports → underline · missing_context → brackets
//   framing → highlighter behind the words · unclear → dashed underline
// Drawn by hand (P8, 05 §3.1): each line gets a pencil's irregularity, seeded by the part and the span, so a reload
// draws the same line; when its event arrives live it draws in stepped frames at 12fps and boils three times, then is
// still (globals.css `.mark[data-play]`). Reduced motion and a stored case show the finished mark.

export type MarkInk = 'pencil-red' | 'pencil-blue' | 'ochre' | 'support' | 'graphite' | 'highlighter';

const STROKE: Record<MarkInk, string> = {
  'pencil-red': 'stroke-pencil-red',
  'pencil-blue': 'stroke-pencil-blue',
  ochre: 'stroke-ochre',
  support: 'stroke-support',
  graphite: 'stroke-graphite',
  highlighter: 'stroke-highlighter',
};

/** The same inks as CSS values, for a rule drawn in the relation's colour (the evidence ↔ span link). */
export const INK_VAR: Record<MarkInk, string> = {
  'pencil-red': 'var(--pencil-red)',
  'pencil-blue': 'var(--pencil-blue)',
  ochre: 'var(--ochre)',
  support: 'var(--support)',
  graphite: 'var(--graphite)',
  highlighter: 'var(--ochre)',
};

/**
 * The ink for a mark. Once the Judge has labelled the part, a challenger's red finding that the
 * ruling didn't uphold (anything but Contradicted) is kept in graphite: the finding stays visible,
 * but red, the error color, no longer contradicts the verdict.
 */
export function markInk(
  agent: string | null,
  relation: Relation,
  label: Label | null = null,
  stopped = false,
): MarkInk {
  const ink = baseInk(agent, relation);
  if (ink !== 'pencil-red') return ink;
  // A run that stopped has no ruling, so a challenger's finding stays a finding, not an error.
  return stopped || (label && label !== 'contradicted') ? 'graphite' : ink;
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

/** A pencil line from (x1, y1) to (x2, y2): the ends drift and the middle bows by up to ±0.6px. */
function pencilLine(r: () => number, x1: number, y1: number, x2: number, y2: number): string {
  const j = () => wobbleOf(r, 0.6);
  const mx = (x1 + x2) / 2 + j();
  const my = (y1 + y2) / 2 + j();
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1 + j())} ${f(y1 + j())} Q${f(mx)} ${f(my)} ${f(x2 + j())} ${f(y2 + j())}`;
}

function paths(relation: Relation, w: number, h: number, ruled: boolean, first: boolean, last: boolean, seed: string): string[] {
  const r = seededRandom(seed);
  switch (relation) {
    case 'contradicts':
      return ruled ? [pencilLine(r, 1, h * 0.56, w - 1, h * 0.5)] : [pencilLine(r, 1, h - 2, w - 1, h - 2.5)];
    case 'supports':
      return [pencilLine(r, 1, h - 2, w - 1, h - 2.5)];
    case 'missing_context': {
      // Brackets open on the span's first line and close on its last, like a pencil would. They
      // sit in the gutter outside the words (the svg is widened by BRACKET_PAD on each side), so
      // no letter is ever drawn over.
      const j = () => wobbleOf(r, 0.6).toFixed(2);
      return [
        ...(first ? [`M${5 + +j()} 1 L1.5 ${1 + +j()} L${1.5 + +j()} ${h - 1} L5 ${h - 1 + +j()}`] : []),
        ...(last ? [`M${w - 5 + +j()} 1 L${w - 1.5} ${1 + +j()} L${w - 1.5 + +j()} ${h - 1} L${w - 5} ${h - 1 + +j()}`] : []),
      ];
    }
    case 'framing':
      return [`M0 ${h * 0.55} L${w} ${h * 0.55}`];
    default:
      return [pencilLine(r, 1, h - 2, w - 1, h - 2)];
  }
}

/** How the mark is drawn, and in how many 12fps frames (05 §3.1). */
export function markStroke(relation: Relation, ruled: boolean): { stroke: MarkStroke; draw: 'line' | 'swipe' } {
  switch (relation) {
    case 'contradicts':
      return { stroke: ruled ? 'strike' : 'underline', draw: 'line' };
    case 'missing_context':
      return { stroke: 'bracket', draw: 'line' };
    case 'framing':
      return { stroke: 'swipe', draw: 'swipe' };
    case 'unclear':
      return { stroke: 'underline', draw: 'swipe' };
    default:
      return { stroke: 'underline', draw: 'line' };
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
  seed,
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
  /** Seeds the pencil's wobble: the part's claim id. */
  seed: string;
}) {
  const pad = relation === 'missing_context' ? BRACKET_PAD : 0;
  const w = Math.max(4, rect.width) + pad * 2;
  const h = Math.max(4, rect.height);
  const highlight = relation === 'framing';
  const { stroke, draw } = markStroke(relation, ruled);
  // Every line of one span shares the key: they mount together and draw one after another.
  const key = `mark:${seed}:${span[0]}-${span[1]}:${relation}:${ruled}`;
  const play = usePlayOnce(key);
  // A fresh mark boils once, on its last line, if the shared budget (working glyphs + marks, at most 3) has room.
  const [boil, release] = useBoilSlot(key, play && last && draw === 'line', useContext(LaneFx).boiling.size);
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
      data-play={play || undefined}
      data-boil={boil || undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'boil' && e.target === e.currentTarget) release();
      }}
      data-draw={draw}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ '--x': `${rect.x - pad}px`, '--y': `${rect.y}px`, '--line': line, '--frames': MARK_FRAMES[stroke] } as React.CSSProperties}
    >
      {paths(relation, w, h, ruled, first, last, `${seed}:${span[0]}-${span[1]}:${line}`).map((d, i) => (
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

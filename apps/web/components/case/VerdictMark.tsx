'use client';

import { cn } from 'cn';
import { MARK_FRAMES } from '@/lib/handdrawn';
import type { MarkRect } from '@/lib/marks/measure';
import { usePlayOnce } from './arrival';
import { verdictInfo } from '@/lib/verdict';
import type { Label } from '@/lib/runs/types';

// The Judge's mark on a strip (04 §3.3), drawn over the whole part once verdict.final arrives:
//   mixed → a half-underline, one half in each ink (support and red)
//   unverifiable → a dashed box in graphite (never red)
//   missing_context → a caret "^" under the end of the part, in ochre (the Auditor's brackets stay)
// Supported gets its tick in the margin (Tick) and contradicted its strike (the Fact Challenger's
// mark becomes the strike once ruled; see Mark). Blocked has no mark. Same stepped draw as the other marks: the
// half-underline 6 frames, the caret 4, the dashed box swiped round in 9 (05 §3.1).

export function VerdictMark({ rect, label, line, seed }: { rect: MarkRect; label: Label; line: number; /** The part's claim id. */ seed: string }) {
  const info = verdictInfo(label);
  const play = usePlayOnce(`verdict:${seed}:${label}`);
  if (!info || (info.mark !== 'half-underline' && info.mark !== 'dashed-box' && info.mark !== 'bracket-caret')) {
    return null;
  }
  const w = Math.max(6, rect.width);
  const h = Math.max(6, rect.height);
  const dashed = info.mark === 'dashed-box';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-verdict-mark={info.mark}
      data-relation={dashed ? 'unclear' : 'verdict'}
      data-play={play || undefined}
      data-draw={dashed ? 'swipe' : 'line'}
      className="mark pointer-events-none absolute overflow-visible"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={
        {
          '--x': `${rect.x}px`,
          '--y': `${rect.y}px`,
          '--line': line,
          '--frames': MARK_FRAMES[dashed ? 'circle' : info.mark === 'bracket-caret' ? 'caret' : 'underline'],
        } as React.CSSProperties
      }
    >
      {info.mark === 'half-underline' && (
        <>
          <path d={`M1 ${h + 2} L${w / 2} ${h + 2}`} pathLength={1} strokeDasharray={1} className="stroke-support" fill="none" strokeWidth={2} strokeLinecap="round" />
          <path d={`M${w / 2} ${h + 2} L${w - 1} ${h + 2.5}`} pathLength={1} strokeDasharray={1} className="stroke-pencil-red" fill="none" strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {dashed && (
        <rect x={-3} y={-1} width={w + 6} height={h + 2} rx={2} fill="none" className="stroke-graphite" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      {info.mark === 'bracket-caret' && (
        <path d={`M${w - 8} ${h + 7} L${w - 4} ${h + 1} L${w} ${h + 7}`} pathLength={1} strokeDasharray={1} className="stroke-ochre" fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** The supported part's tick, in the margin. */
export function Tick({ className, seed }: { className?: string; /** The part's claim id. */ seed: string }) {
  const play = usePlayOnce(`tick:${seed}`);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={22}
      height={22}
      data-play={play || undefined}
      className={cn('mark stroke-support', className)}
      style={{ '--x': '0px', '--y': '0px', '--frames': MARK_FRAMES.tick } as React.CSSProperties}
      fill="none"
    >
      <path d="M4 12.5 L9.5 18 L20 6" pathLength={1} strokeDasharray={1} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

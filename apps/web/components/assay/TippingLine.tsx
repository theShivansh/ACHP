import { cn } from 'cn';
import {
  bandWord,
  nearestFlip,
  signalValue,
  signalWords,
  tippingSentence,
  verdictName,
  verdictRank,
  VERDICT_ZONES,
} from '@/lib/assay/present';
import { verdictOf } from '@/lib/assay/assay';
import type { AssayComputed } from '@/lib/runs/types';

// The Tipping Point (04 §7.1, 11 §3.4): how close the formula's reading is to flipping. A 0–1 axis with
// the five verdict zones in neutral steps (no hue), the case's overall score as a dot, and a leader to the
// nearest boundary labelled with the lever. Under 768px the zones are a vertical list of chips instead of
// the drawing; the same list is the screen-reader twin at every width.

const X0 = 16;
const SPAN = 608;
const x = (v: number) => X0 + SPAN * Math.min(1, Math.max(0, v));
const STEP = ['fill-sheet-line/45', 'fill-sheet-line/60', 'fill-sheet-line/75', 'fill-sheet-line/90', 'fill-sheet-line'];
const RANGE = (from: number, to: number) => `${from.toFixed(2)}–${to.toFixed(2)}`;

/** The verdict boundary the nearest flip crosses: below the current zone's floor, or above its ceiling. */
function boundaryOf(current: string, target: string): number {
  const zone = VERDICT_ZONES.find((z) => z.verdict === current) ?? VERDICT_ZONES[2];
  return verdictRank(target) < verdictRank(current) ? zone.from : zone.to;
}

export function TippingLine({ assay, className }: { assay: AssayComputed; className?: string }) {
  const tp = assay.tipping_point;
  if (!tp) return null;
  const c = assay.composite;
  const here = verdictOf(c);
  const flip = nearestFlip(tp);
  const boundary = flip ? boundaryOf(here, flip.new_verdict) : null;
  const lever = flip
    ? typeof flip.to === 'number'
      ? `${signalWords(flip.signal).toLowerCase()} ${signalValue(flip.signal, flip.from as number)} → ${signalValue(flip.signal, Math.round(flip.to * 100) / 100)}`
      : `${signalWords(flip.signal).toLowerCase()} → ${flip.to}`
    : null;
  const mid = boundary != null ? (x(c) + x(boundary)) / 2 : x(c);

  return (
    <section aria-labelledby="tipping-title" data-tipping={tp.band} className={cn('max-w-[68ch]', className)}>
      <h3 id="tipping-title" className="type-ui font-semibold text-ink">
        Tipping point
      </h3>
      <p className="mt-1 max-w-[68ch] type-body text-pretty text-ink">
        <span className="sr-only">{bandWord(tp.band)} band. </span>
        {tippingSentence(tp)}
      </p>

      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 640 112"
        className="mt-3 hidden h-auto w-full max-w-[640px] md:block"
      >
        {VERDICT_ZONES.map((z, i) => (
          <g key={z.verdict}>
            <rect x={x(z.from)} y="38" width={x(z.to) - x(z.from)} height="22" className={STEP[i]} />
            <path d={`M${x(z.from)} 36 V62`} className="stroke-ink-3" strokeWidth="1" />
            <text x={(x(z.from) + x(z.to)) / 2} y="30" textAnchor="middle" className="fill-ink-2 font-sans text-[12px]">
              {verdictName(z.verdict)}
            </text>
          </g>
        ))}
        <path d={`M${x(1)} 36 V62`} className="stroke-ink-3" strokeWidth="1" />
        {[0, 0.3, 0.5, 0.7, 0.85, 1].map((t) => (
          <text key={t} x={x(t)} y="76" textAnchor="middle" className="fill-ink-2 font-sans text-[11px] tabular-nums">
            {t === 0 ? '0' : t === 1 ? '1' : t.toFixed(2).replace(/0$/, '')}
          </text>
        ))}
        {boundary != null && (
          <g className="stroke-ink" strokeWidth="1.5">
            <path d={`M${x(c)} 49 H${x(boundary)}`} />
            <path d={`M${x(boundary)} 40 V58`} />
          </g>
        )}
        <circle cx={x(c)} cy="49" r="6" className="fill-sheet" />
        <circle cx={x(c)} cy="49" r="4" className="fill-mark-focus" data-composite={c} />
        {lever && (
          <text x={mid} y="98" textAnchor="middle" className="fill-ink font-sans text-[12px]">
            {lever} flips to {verdictName(flip!.new_verdict)}
          </text>
        )}
      </svg>

      <ul
        aria-label="Where the overall score sits on the verdict scale"
        className="mt-3 border-t-(length:--rule) border-sheet-line md:sr-only"
      >
        {VERDICT_ZONES.map((z) => {
          const current = z.verdict === here;
          return (
            <li
              key={z.verdict}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex items-center gap-3 border-b-(length:--rule) border-sheet-line py-2 type-body',
                current ? 'font-semibold text-ink' : 'text-ink-2',
              )}
            >
              {/* The case's dot sits in its own zone, with a 2px ring of the sheet around it (04 §7.1). */}
              <span aria-hidden="true" className="flex size-3 shrink-0 items-center justify-center">
                {current && <span className="size-2 rounded-full bg-mark-focus ring-2 ring-sheet" />}
              </span>
              <span className={cn('flex-1 border-l-(length:--rule) pl-3', current ? 'border-ink' : 'border-sheet-line')}>
                {verdictName(z.verdict)}
                {current && <span className="sr-only"> (this case, {c.toFixed(2)})</span>}
              </span>
              <span className="type-meta tabular-nums">{RANGE(z.from, z.to)}</span>
            </li>
          );
        })}
      </ul>
      {boundary != null && (
        <p data-edge className="mt-2 type-meta text-ink-2 md:sr-only">
          The overall score is {c.toFixed(2)}; the nearest edge is {boundary.toFixed(2)}.
        </p>
      )}
    </section>
  );
}

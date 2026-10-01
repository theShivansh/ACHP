'use client';

import { cn } from 'cn';
import { useId } from 'react';
import { seededRandom } from '@/lib/handdrawn';
import { usePlayOnce } from './arrival';
import { seededTilt, verdictInfo } from '@/lib/verdict';

// Stamp v1 (04 §7). An SVG rubber stamp: an irregular border, the verdict in Newsreader 600 caps
// (the one place uppercase is allowed), and an ink texture from a static feTurbulence threshold, so
// it looks pressed rather than printed. The tilt (1.2° to 3° either way) is seeded from the id, so the same
// claim always gets the same stamp. When the verdict arrives while you watch it is pressed in four 12fps frames
// (05 §3.3: lifted, pressed past flat, settled); otherwise it is simply there.
// `role="img"` + a written label: the stamp is never the only carrier of the verdict.

const SIZES = {
  overall: { font: 34, pad: 18, h: 66, stroke: 3 },
  strip: { font: 15, pad: 9, h: 30, stroke: 1.75 },
} as const;

/** A rounded-rectangle outline whose corners and edges drift by a pixel or two. */
export function wobblyRect(w: number, h: number, seed: string, amount = 1.4): string {
  const r = seededRandom(seed);
  const j = () => (r() - 0.5) * 2 * amount;
  const c = 4;
  const p = (x: number, y: number) => `${(x + j()).toFixed(2)} ${(y + j()).toFixed(2)}`;
  return [
    `M${p(c, 1)}`,
    `L${p(w / 2, 1)} L${p(w - c, 1)}`,
    `Q${p(w - 1, 1)} ${p(w - 1, c)}`,
    `L${p(w - 1, h / 2)} L${p(w - 1, h - c)}`,
    `Q${p(w - 1, h - 1)} ${p(w - c, h - 1)}`,
    `L${p(w / 2, h - 1)} L${p(c, h - 1)}`,
    `Q${p(1, h - 1)} ${p(1, h - c)}`,
    `L${p(1, h / 2)} L${p(1, c)}`,
    `Q${p(1, 1)} ${p(c, 1)}Z`,
  ].join(' ');
}

export function Stamp({
  label,
  id,
  size = 'strip',
  at = 0,
  className,
}: {
  /** A server label (or a legacy verdict); an unknown value renders nothing rather than a guess. */
  label: string;
  /** Seeds the tilt and the border wobble: the claim id, or the run id for the overall stamp. */
  id: string;
  size?: keyof typeof SIZES;
  /** Frames to wait before pressing (the overall stamp lands after the parts'). */
  at?: number;
  className?: string;
}) {
  const info = verdictInfo(label);
  const uid = useId().replace(/:/g, '');
  // Pressed only when its verdict arrives while you watch (arrival.tsx); a stored case shows it in place.
  const play = usePlayOnce(`stamp:${id}:${size}:${label}`);
  if (!info) return null;
  const s = SIZES[size];
  // Caps in Newsreader 600 run about 0.68em per glyph; the tracking is small, not the wide-tracked label style.
  const w = Math.round(info.stamp.length * s.font * 0.68 + s.pad * 2);
  const tilt = seededTilt(id);
  const filter = `ink-${uid}`;
  return (
    <svg
      role="img"
      aria-label={`Verdict: ${info.name}`}
      data-slot="stamp"
      data-label={info.label}
      data-play={play || undefined}
      viewBox={`0 0 ${w} ${s.h}`}
      width={w}
      height={s.h}
      // max-w-full h-auto: a wide stamp (MISSING CONTEXT) scales down to a 320px column instead of scrolling the page sideways.
      className={cn('stamp inline-block h-auto max-w-full shrink-0 rotate-(--tilt) overflow-visible', info.text, className)}
      style={{ '--tilt': `${tilt}deg`, '--at': `calc(${at} * var(--fps-stop))` } as React.CSSProperties}
    >
      <defs>
        {/* Static ink texture: noise thresholded into speckled gaps, applied once, never animated. */}
        <filter id={filter} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.85" result="alpha" />
          <feComposite in="SourceGraphic" in2="alpha" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${filter})`} fill="none" stroke="currentColor">
        <path d={wobblyRect(w, s.h, `${id}:${info.label}`)} strokeWidth={s.stroke} strokeLinejoin="round" />
        <text
          x={w / 2}
          y={s.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          stroke="none"
          fontFamily="var(--font-display)"
          fontWeight={600}
          fontSize={s.font}
          letterSpacing="0.02em"
        >
          {info.stamp}
        </text>
      </g>
    </svg>
  );
}

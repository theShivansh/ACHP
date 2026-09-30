'use client';

import { cn } from 'cn';
import { useId, useState } from 'react';
import { fillLevel, metricLabel, METRIC_INFO, METRICS, score100, type MetricName } from '@/lib/assay/present';
import type { Metrics } from '@/lib/runs/types';
import { GEOMETRY, W } from './hallmarkGeometry';

// The Assay Hallmark (04 §7.1, 11 §3.1): five punched cartouches, one per metric, each its own shape so it
// reads without color. The ink rises from the bottom to the value; BIS is hatched (impurity), because more
// of it is worse. A finer outline marks the measures humans agreed with least (r < 0.75). It replaces the
// radar, which couldn't show direction, reuse or disagreement.

function Cartouche({ code, value, size }: { code: MetricName; value: number; size: number }) {
  const uid = useId().replace(/:/g, '');
  const info = METRIC_INFO[code];
  const g = GEOMETRY[info.shape];
  const level = fillLevel(value);
  const fillTop = g.bottom - (g.bottom - g.top) * level;
  const hatched = code === 'BIS';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${W} ${W}`}
      width={size}
      height={size}
      data-cartouche={code}
      data-fill={level.toFixed(2)}
      className="overflow-visible"
    >
      <defs>
        <clipPath id={`clip-${uid}`}>
          <path d={g.path} />
        </clipPath>
        {hatched && (
          <pattern id={`hatch-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" className="stroke-pencil-red" strokeWidth="1.5" />
          </pattern>
        )}
      </defs>
      <g clipPath={`url(#clip-${uid})`}>
        <rect
          x="0"
          y={fillTop}
          width={W}
          height={W}
          data-ink
          className={hatched ? undefined : 'fill-ink-2/55'}
          fill={hatched ? `url(#hatch-${uid})` : undefined}
        />
      </g>
      <path d={g.path} fill="none" className="stroke-ink" strokeWidth={info.fine ? 1 : 1.5} strokeLinejoin="round" />
      {g.extra && <path d={g.extra} fill="none" className="stroke-ink" strokeWidth={info.fine ? 1 : 1.5} />}
      {/* Letters only where they are legible: at 24px they would be a smudge on the fill. */}
      {size >= 28 && (
        <text
          x="14"
          y={info.shape === 'level' ? 17.6 : 17}
          textAnchor="middle"
          className="fill-ink font-sans text-[9px] font-semibold"
        >
          {code}
        </text>
      )}
    </svg>
  );
}

/**
 * Five marks in a row. Each is focusable and named in full ("Bias Impact Score (BIS) · 20 · lower is
 * better"); the same text shows as a tooltip on hover and focus. The tooltip can be hovered and is
 * dismissed with Escape (WCAG 1.4.13). The table twin is the legend on the Assay tab. At 40px the score
 * is printed under each mark.
 */
export function Hallmark({
  metrics,
  size = 28,
  className,
}: {
  metrics: Metrics;
  /** 24 in a row of a table, 28 compact, 40 where the Hallmark is the signature (the report header, the Assay tab). */
  size?: 24 | 28 | 40;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState<MetricName | null>(null);
  return (
    <div
      role="group"
      aria-label="Assay hallmark: the five scores"
      data-hallmark
      className={cn('flex items-start', size === 40 ? 'gap-3' : 'gap-2', className)}
    >
      {METRICS.map((code) => {
        const label = metricLabel(code, metrics[code]);
        return (
          <span
            key={code}
            role="img"
            aria-label={label}
            tabIndex={0}
            data-dismissed={dismissed === code || undefined}
            onPointerEnter={() => setDismissed(null)}
            onFocus={() => setDismissed(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && dismissed !== code) {
                setDismissed(code);
                e.stopPropagation();
              }
            }}
            className="group relative inline-flex min-h-6 min-w-6 cursor-help flex-col items-center gap-0.5 rounded-card outline-offset-4"
          >
            <Cartouche code={code} value={metrics[code]} size={size} />
            {size === 40 && (
              <span aria-hidden="true" data-score className="type-meta tabular-nums text-ink-2">
                {score100(metrics[code])}
              </span>
            )}
            <span
              aria-hidden="true"
              className="absolute bottom-full left-1/2 z-10 hidden w-max max-w-64 -translate-x-1/2 pb-2 group-hover:block group-focus-visible:block group-data-dismissed:hidden!"
            >
              <span className="block rounded-card border-(length:--rule) border-sheet-line bg-sheet px-2 py-1 type-meta whitespace-normal text-ink shadow-lift-card">
                {label}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

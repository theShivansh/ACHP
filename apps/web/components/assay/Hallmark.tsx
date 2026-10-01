'use client';

import { cn } from 'cn';
import { useEffect, useId, useState } from 'react';
import { fillLevel, metricLabel, METRIC_INFO, METRICS, score100, type MetricName } from '@/lib/assay/present';
import type { Metrics } from '@/lib/runs/types';
import { useAssayFocus, useMetricLit } from './assayLink';
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

/** One mark of the Hallmark: focusable, named in full, with its tooltip and its link to the Ledger rows that fed it. */
function HallmarkMark({
  code,
  value,
  size,
  dismissed,
  onDismiss,
}: {
  code: MetricName;
  value: number;
  size: 24 | 28 | 40;
  dismissed: boolean;
  onDismiss: (d: boolean) => void;
}) {
  const label = metricLabel(code, value);
  const lit = useMetricLit(code);
  const link = useAssayFocus('metric', code);
  // Escape dismisses the tooltip while the mark is hovered or focused, wherever the keyboard focus is (1.4.13).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss(true);
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onDismiss]);
  return (
    <span
      role="img"
      aria-label={label}
      tabIndex={0}
      data-dismissed={dismissed || undefined}
      data-metric={code}
      onPointerEnter={() => {
        onDismiss(false);
        setOpen(true);
        link.onPointerEnter();
      }}
      onPointerLeave={() => {
        setOpen(false);
        link.onPointerLeave();
      }}
      onFocus={() => {
        onDismiss(false);
        setOpen(true);
        link.onFocus();
      }}
      onBlur={() => {
        setOpen(false);
        link.onBlur();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !dismissed) e.stopPropagation();
      }}
      className="group relative inline-flex min-h-6 min-w-6 cursor-help flex-col items-center gap-0.5 rounded-card outline-offset-4"
    >
      <Cartouche code={code} value={value} size={size} />
      {size === 40 && (
        <span aria-hidden="true" data-score className="type-meta tabular-nums text-ink-2">
          {score100(value)}
        </span>
      )}
      {/* The rule under the mark: it is the one being read (active), or it fed the Ledger row being read (lit). */}
      <span
        aria-hidden="true"
        data-link-rule={code}
        data-lit={lit !== 'idle' || undefined}
        className="link-ul pointer-events-none absolute inset-x-0 bottom-0 h-0 [--ul:var(--ink)]"
      />
      <span
        aria-hidden="true"
        className="invisible absolute bottom-full left-1/2 z-10 w-max max-w-64 -translate-x-1/2 pb-2 opacity-0 group-hover:visible group-hover:opacity-100 group-hover:transition-[opacity,visibility] group-hover:delay-(--dur-tooltip-delay) group-hover:duration-(--dur-quick) motion-reduce:group-hover:transition-none group-focus-visible:visible group-focus-visible:opacity-100 group-data-dismissed:invisible! group-data-dismissed:opacity-0!"
      >
        <span className="block rounded-card border-(length:--rule) border-sheet-line bg-sheet px-2 py-1 type-meta whitespace-normal text-ink shadow-lift-card">
          {label}
        </span>
      </span>
    </span>
  );
}

/**
 * Five marks in a row. Each is focusable and named in full ("Bias Impact Score (BIS) · 20 · lower is
 * better"); the same text shows as a tooltip on hover (after a short wait) and at once on focus. The tooltip can
 * be hovered and is dismissed with Escape (WCAG 1.4.13). Hovering or focusing a mark underlines the Ledger rows
 * that fed it (wherever a Ledger sits in the same AssayLinkProvider). At 40px the score is printed under each
 * mark. The table twin is the legend on the Assay tab.
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
      {METRICS.map((code) => (
        <HallmarkMark
          key={code}
          code={code}
          value={metrics[code]}
          size={size}
          dismissed={dismissed === code}
          onDismiss={(d) => setDismissed(d ? code : null)}
        />
      ))}
    </div>
  );
}

'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { score100 } from '@/lib/assay/present';
import { QUADRANT_WORDS, type Quadrant, type RunSummary } from '@/lib/runs/runSummary';
import type { AssayComputed } from '@/lib/runs/types';
import { excerpt, verdictInfo } from '@/lib/verdict';

// The Integrity Map (11 §3.9, 04 §7.2): every scored check on one plane. x = facts (the Consensus Truth Score), y =
// how calm the wording reads. One series in neutral ink; the hovered or focused check is in the pencil's blue and its
// details are written under the plot. Dots are 9px across with a 24px hit area, the quadrants are named on the plot, and
// the same points are a table below (the table is the accessible version, not a fallback). Values are the server's
// `assay.integrity_map`; nothing is computed here.

type Scored = RunSummary & { assay: AssayComputed };

const W = 480;
const H = 340;
const L = 52;
const R = 460;
const T = 14;
const B = 296;
const px = (x: number) => L + x * (R - L);
const py = (y: number) => B - y * (B - T);

const QUADRANT_LABELS: { q: Quadrant; x: number; y: number; anchor: 'start' | 'end' }[] = [
  { q: 'quiet_falsehood', x: L + 8, y: T + 18, anchor: 'start' },
  { q: 'sound', x: R - 8, y: T + 18, anchor: 'end' },
  { q: 'loud_falsehood', x: L + 8, y: B - 10, anchor: 'start' },
  { q: 'true_but_loaded', x: R - 8, y: B - 10, anchor: 'end' },
];

export function IntegrityMap({
  rows,
  focusId,
  onFocus,
}: {
  rows: Scored[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const focused = rows.find((r) => r.id === focusId) ?? null;
  const counts = rows.reduce<Record<string, number>>((n, r) => {
    const q = r.assay.integrity_map.quadrant;
    return { ...n, [q]: (n[q] ?? 0) + 1 };
  }, {});
  const quadrants = Object.keys(QUADRANT_WORDS) as Quadrant[];
  const summary = quadrants.map((q) => `${counts[q] ?? 0} ${QUADRANT_WORDS[q].name.toLowerCase()}`).join(', ');

  return (
    <div data-integrity-map>
      <div className="paper rounded-sheet px-3 py-4 shadow-lift-sheet md:px-6">
        {/* Below 360px the plot is too small to read: the quadrant chips and the table carry it. */}
        <ul aria-label="Checks by quadrant" className="hidden flex-wrap gap-2 max-[22.5rem]:flex">
          {quadrants.map((q) => (
            <li key={q} className="rounded-chip border-(length:--rule) border-sheet-line px-2 py-1 type-meta text-ink">
              {QUADRANT_WORDS[q].name}: {counts[q] ?? 0}
            </li>
          ))}
        </ul>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={`Integrity Map: ${rows.length} checks. ${summary}.`}
          className="mx-auto h-auto w-full max-w-[640px] text-ink max-[22.5rem]:hidden"
        >
          {/* Frame, the 0.5 lines that make the four quadrants, and the axes. */}
          <rect x={L} y={T} width={R - L} height={B - T} fill="none" className="stroke-sheet-line" strokeWidth={1} />
          <line x1={px(0.5)} x2={px(0.5)} y1={T} y2={B} className="stroke-ink-3" strokeWidth={1} strokeDasharray="3 4" />
          <line x1={L} x2={R} y1={py(0.5)} y2={py(0.5)} className="stroke-ink-3" strokeWidth={1} strokeDasharray="3 4" />
          {[0, 0.5, 1].map((t) => (
            <g key={t} className="fill-ink-2 text-[11px]">
              <text x={px(t)} y={B + 16} textAnchor="middle">
                {t}
              </text>
              <text x={L - 8} y={py(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <text x={(L + R) / 2} y={H - 8} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
            Facts: the Consensus Truth Score (CTS), 0 to 1 →
          </text>
          <text transform={`translate(13 ${(T + B) / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
            ↑ Reads calm, 0 to 1
          </text>
          {QUADRANT_LABELS.map((l) => (
            <text
              key={l.q}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              className={cn('text-[12px]', l.q === 'quiet_falsehood' ? 'fill-pencil-red font-semibold' : 'fill-ink-2')}
            >
              {QUADRANT_WORDS[l.q].name}
            </text>
          ))}
          {rows.map((r) => {
            const p = r.assay.integrity_map;
            const on = r.id === focusId;
            const info = verdictInfo(r.label);
            return (
              <Link
                key={r.id}
                href={`/case/${r.id}`}
                aria-label={`${QUADRANT_WORDS[p.quadrant].name}: ${excerpt(r.claim, 80)}. ${info ? `Judge: ${info.name}. ` : ''}Facts ${score100(p.x)}, calm ${score100(p.y)}. Open the case.`}
                onPointerEnter={() => onFocus(r.id)}
                onPointerLeave={() => onFocus(null)}
                onFocus={() => onFocus(r.id)}
                onBlur={() => onFocus(null)}
                className="outline-none [&:focus-visible>circle:last-child]:stroke-pencil-blue [&:focus-visible>circle:last-child]:stroke-2"
              >
                <circle data-hit cx={px(p.x)} cy={py(p.y)} r={12} fill="transparent" stroke="none" />
                <circle data-dot={r.id} cx={px(p.x)} cy={py(p.y)} r={on ? 6.5 : 4.5} className={on ? 'fill-pencil-blue' : 'fill-ink'} />
              </Link>
            );
          })}
        </svg>
        <p role="status" data-map-readout className="mt-2 min-h-[2.8em] max-w-[68ch] type-meta text-ink-2">
          {focused ? (
            <>
              <span className="font-semibold text-ink">{QUADRANT_WORDS[focused.assay.integrity_map.quadrant].name}.</span> {excerpt(focused.claim, 110)} Facts{' '}
              {score100(focused.assay.integrity_map.x)}, calm {score100(focused.assay.integrity_map.y)}.
            </>
          ) : (
            'Hover or focus a dot to read it. Each dot opens its case.'
          )}
        </p>
      </div>

      <table data-map-table className="mt-4 w-full border-collapse text-left type-meta text-desk-ink">
        <caption className="pb-2 text-left type-meta text-desk-ink-2">
          The same points as a table. Facts is the Consensus Truth Score and Calm is how measured the wording reads, both out of 100.
        </caption>
        <thead>
          <tr className="border-b-(length:--rule) border-desk-line text-desk-ink-2">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Check
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Quadrant
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">
              Facts
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Calm
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-row={r.id} className={cn('border-b-(length:--rule) border-desk-line', r.id === focusId && 'bg-desk-raised')}>
              <th scope="row" className="py-2 pr-3 font-normal">
                <Link href={`/case/${r.id}`} className="inline-flex min-h-6 items-center underline decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11">
                  {excerpt(r.claim, 70)}
                </Link>
              </th>
              <td className="py-2 pr-3">{QUADRANT_WORDS[r.assay.integrity_map.quadrant].name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{score100(r.assay.integrity_map.x)}</td>
              <td className="py-2 text-right tabular-nums">{score100(r.assay.integrity_map.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

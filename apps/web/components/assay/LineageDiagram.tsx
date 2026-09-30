'use client';

import { cn } from 'cn';
import { useState } from 'react';
import { lineageEdges, lineageSignals, pathCounts, reaches, type LineageMode } from '@/lib/assay/lineage';
import { METRICS, signalWords, type MetricName } from '@/lib/assay/present';
import { MetricTerm } from './MetricTerm';

// Signal Lineage (04 §7.1, 11 §3.6): where every number comes from. Three columns (raw signals → the five
// scores → the overall score); an edge's width is its weight in the formula. A signal used by several
// scores is drawn in ochre with its path count: the framing score is the one. Paper ↔ Production shows
// where the code differs from the paper. Each node is focusable and names its inputs and outputs; the
// table under the drawing is the twin at every width, and the only view under 768px.

const ROW = 26;
const TOP = 24;
const X_SIG = 176;
const X_MET = 380;
const X_ALL = 560;
const SHARED = 's_fr';

function Segmented({ value, onChange }: { value: LineageMode; onChange: (m: LineageMode) => void }) {
  const opts: { id: LineageMode; label: string }[] = [
    { id: 'paper', label: 'Paper formulas' },
    { id: 'code', label: 'Production code' },
  ];
  return (
    <div role="group" aria-label="Which formulas to show" className="inline-flex rounded-button border-(length:--rule) border-ink-3 p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'min-h-6 cursor-pointer rounded-[4px] px-3 type-meta pointer-coarse:min-h-11',
            value === o.id ? 'bg-ink text-sheet' : 'text-ink hover:bg-sheet-line/60',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LineageDiagram({ judgeNss = true }: { judgeNss?: boolean }) {
  const [mode, setMode] = useState<LineageMode>('code');
  const [picked, setPicked] = useState<string | null>(null);
  const edges = lineageEdges(mode, judgeNss);
  const signals = lineageSignals(mode, judgeNss);
  const counts = pathCounts(edges);
  const height = TOP * 2 + signals.length * ROW;
  const ySig = (i: number) => TOP + ROW / 2 + i * ROW;
  const yMet = (m: string) => {
    const i = METRICS.indexOf(m as MetricName);
    return TOP + ((i + 0.5) / METRICS.length) * (signals.length * ROW);
  };
  const yAll = TOP + (signals.length * ROW) / 2;
  const nodeY = (id: string) => (signals.includes(id) ? ySig(signals.indexOf(id)) : yMet(id));
  const on = (from: string) => picked == null || picked === from;

  const detail = picked
    ? `${signalWords(picked)} feeds ${counts[picked] ?? 0} ${counts[picked] === 1 ? 'path' : 'paths'}, reaching ${reaches(edges, picked).join(', ')}.`
    : `${signalWords(SHARED)} is the most reused signal: ${counts[SHARED]} direct paths into the scores in the ${mode === 'code' ? 'production code' : 'paper'}.`;

  return (
    <section aria-labelledby="lineage-title" data-lineage={mode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="lineage-title" className="type-ui font-semibold text-ink">
            Where the numbers come from
          </h3>
          <p className="mt-1 max-w-[60ch] type-body text-ink-2">
            {signals.length} signals feed five scores, which make the overall score. Line width is the weight in the formula.
          </p>
        </div>
        <Segmented value={mode} onChange={setMode} />
      </div>

      <svg
        viewBox={`0 0 640 ${height}`}
        role="group"
        aria-label="Signal lineage: signals to scores to the overall score"
        className="mt-4 hidden h-auto w-full md:block"
      >
        {edges.map((e, i) => {
          const y1 = nodeY(e.from);
          const y2 = yMet(e.to);
          const fromX = e.indirect ? X_MET - 2 : X_SIG;
          const toX = X_MET;
          const mid = e.indirect ? X_MET - 60 : (fromX + toX) / 2;
          const shared = e.from === SHARED;
          return (
            <path
              key={i}
              d={`M${fromX} ${y1} C${mid} ${y1} ${mid} ${y2} ${toX} ${y2}`}
              fill="none"
              strokeWidth={Math.max(0.75, e.weight * 7)}
              data-edge={`${e.from}>${e.to}`}
              className={cn(shared ? 'stroke-ochre' : 'stroke-ink-3', on(e.from) ? 'opacity-70' : 'opacity-15')}
            />
          );
        })}
        {METRICS.map((m) => (
          <path
            key={m}
            d={`M${X_MET + 60} ${yMet(m)} C${X_MET + 110} ${yMet(m)} ${X_ALL - 50} ${yAll} ${X_ALL} ${yAll}`}
            fill="none"
            strokeWidth="1.4"
            className="stroke-ink-3 opacity-70"
          />
        ))}
        {signals.map((s, i) => (
          <g
            key={s}
            tabIndex={0}
            role="img"
            aria-label={`${signalWords(s)}: ${counts[s] ?? 0} paths`}
            data-signal={s}
            onFocus={() => setPicked(s)}
            onBlur={() => setPicked(null)}
            onPointerEnter={() => setPicked(s)}
            onPointerLeave={() => setPicked(null)}
            className="cursor-default outline-offset-2"
          >
            <rect x="0" y={ySig(i) - ROW / 2 + 1} width={X_SIG} height={ROW - 2} className="fill-transparent" />
            <text x={X_SIG - 8} y={ySig(i) + 4} textAnchor="end" className={cn('font-sans text-[11px]', s === SHARED ? 'fill-ochre font-semibold' : 'fill-ink')}>
              {signalWords(s)}
              {s === SHARED ? ` · ${counts[s]} paths` : ''}
            </text>
            <circle cx={X_SIG} cy={ySig(i)} r="3" className={s === SHARED ? 'fill-ochre' : 'fill-ink-2'} />
          </g>
        ))}
        {METRICS.map((m) => (
          <g key={m} data-metric={m}>
            <rect x={X_MET} y={yMet(m) - 12} width="60" height="24" rx="3" className="fill-sheet stroke-ink" strokeWidth="1" />
            <text x={X_MET + 30} y={yMet(m) + 4} textAnchor="middle" className="fill-ink font-sans text-[11px] font-semibold">
              {m}
            </text>
          </g>
        ))}
        <g data-metric="overall">
          <rect x={X_ALL} y={yAll - 16} width="72" height="32" rx="3" className="fill-sheet stroke-ink" strokeWidth="1.5" />
          <text x={X_ALL + 36} y={yAll + 4} textAnchor="middle" className="fill-ink font-sans text-[11px] font-semibold">
            Overall
          </text>
        </g>
      </svg>
      <p aria-live="polite" data-lineage-detail className="mt-2 max-w-[68ch] type-meta text-ink-2">
        {detail}
      </p>

      <table className="mt-4 w-full border-collapse type-meta">
        <caption className="sr-only">Each signal, the scores it reaches and how many direct paths it takes</caption>
        <thead>
          <tr className="border-b-(length:--rule) border-ink text-left text-ink-2">
            <th scope="col" className="py-1 pr-3 font-semibold">
              Signal
            </th>
            <th scope="col" className="py-1 pr-3 font-semibold">
              Reaches
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Paths
            </th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s} data-signal-row={s} className="border-b-(length:--rule) border-sheet-line">
              <th scope="row" className={cn('py-1 pr-3 text-left font-normal', s === SHARED ? 'font-semibold text-ochre' : 'text-ink')}>
                {signalWords(s)}
              </th>
              <td className="py-1 pr-3 text-ink-2">
                {reaches(edges, s).map((m, i) => (
                  <span key={m}>
                    {i > 0 && ', '}
                    <MetricTerm code={m} />
                  </span>
                ))}
              </td>
              <td className="py-1 text-right tabular-nums text-ink">{counts[s] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {mode === 'code' && (
        <p className="mt-2 max-w-[68ch] type-meta text-ink-3">
          In the production code the framing score also serves as narrative alignment (1 − framing)
          {judgeNss ? '.' : ', and again through the estimated stance score, because the Judge gave none.'}
        </p>
      )}
    </section>
  );
}

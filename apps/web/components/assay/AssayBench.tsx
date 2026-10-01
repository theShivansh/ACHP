'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assay as computeAssay, FRAMES, type Frame, type Signals } from '@/lib/assay/assay';
import { signalValue, signalWords, tippingSentence, verdictName, type SignalGroup } from '@/lib/assay/present';
import { Button } from '@/components/ui/button';
import type { AssayComputed } from '@/lib/runs/types';
import { AssayLinkProvider } from './assayLink';
import { Hallmark } from './Hallmark';
import { IntegrityLedger } from './IntegrityLedger';
import { MaskingNotice } from './MaskingNotice';
import { TwoKey } from './TwoKey';

// The Assay Bench (04 §7.1, 11 §3.8): an explorable explanation. Move the raw signals and the published
// formulas (the browser port of the reference, lib/assay/assay.ts) recompute the five scores, the verdict the
// formula would give, the ledger and the tipping point. It is what-if: it never re-runs an agent, never
// changes the stored report and offers nothing to copy, share or stamp. The case's real values stay marked
// on every slider, and Reset puts them back.

type Key = keyof Signals;
interface Control {
  key: Key;
  kind: 'unit' | 'count' | 'frame';
}

const CONTROLS: Record<SignalGroup, Control[]> = {
  Facts: [
    { key: 'fA', kind: 'unit' },
    { key: 'jCTS', kind: 'unit' },
  ],
  Perspectives: [
    { key: 'fB', kind: 'unit' },
    { key: 's_pcs', kind: 'unit' },
    { key: 'n_miss', kind: 'count' },
  ],
  Wording: [
    { key: 's_nil', kind: 'unit' },
    { key: 's_fr', kind: 'unit' },
    { key: 'pol', kind: 'unit' },
    { key: 'frame', kind: 'frame' },
    { key: 'v_eps', kind: 'unit' },
    { key: 'hr', kind: 'unit' },
    { key: 'jNSS', kind: 'unit' },
  ],
};

/** The server's signals as the browser port wants them (the Judge's stance score may be absent). */
export function signalsOf(a: AssayComputed): Signals {
  const s = a.signals;
  const num = (k: string) => Number(s[k] ?? 0);
  return {
    fA: num('fA'),
    jCTS: num('jCTS'),
    s_nil: num('s_nil'),
    s_fr: num('s_fr'),
    pol: num('pol'),
    frame: (FRAMES.includes(s.frame as Frame) ? s.frame : 'neutral') as Frame,
    fB: num('fB'),
    s_pcs: num('s_pcs'),
    n_miss: Math.round(num('n_miss')),
    v_eps: num('v_eps'),
    hr: num('hr'),
    a_narr: null,
    jNSS: s.jNSS == null ? null : Number(s.jNSS),
  };
}

/** What the browser port computed, shaped like the server's readout so the same components draw it. */
export function whatIf(signals: Signals, judgeVerdict: string): AssayComputed {
  const a = computeAssay(signals, judgeVerdict, 'code');
  return {
    formula_version: a.formula_version,
    mode: 'code',
    signals: { ...signals } as AssayComputed['signals'],
    metrics: a.metrics,
    composite: a.composite,
    formula_verdict: a.formula_verdict,
    judge_verdict: judgeVerdict,
    two_key: a.two_key as AssayComputed['two_key'],
    ledger: { ...a.ledger, entries: a.ledger.entries } as AssayComputed['ledger'],
    tipping_point: { ...a.tipping_point, flips: a.tipping_point.flips.slice(0, 5) } as AssayComputed['tipping_point'],
    masking: a.masking,
    integrity_map: a.integrity_map as AssayComputed['integrity_map'],
  };
}

function Slider({
  control,
  value,
  real,
  onChange,
}: {
  control: Control;
  value: Signals[Key];
  real: Signals[Key];
  onChange: (v: number | string) => void;
}) {
  const label = signalWords(control.key);
  const id = `bench-${control.key}`;
  if (control.kind === 'frame') {
    return (
      <fieldset className="min-w-0">
        <legend className="type-meta text-ink">{label}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {FRAMES.map((f) => (
            <label key={f} className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 type-meta text-ink pointer-coarse:min-h-11">
              <input type="radio" name={id} value={f} checked={value === f} onChange={() => onChange(f)} className="accent-ink" />
              {f}
              {real === f && <span className="text-ink-3">(the case)</span>}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (value == null) {
    return (
      <div>
        <span className="type-meta text-ink">{label}</span>
        <p className="type-meta text-ink-3">Not given for this case; the formula estimates it.</p>
      </div>
    );
  }
  const max = control.kind === 'count' ? 10 : 1;
  const at = Number(real) / max;
  return (
    <div className="scroll-mt-80">
      <div className="flex items-baseline justify-between gap-3 type-meta text-ink">
        <label htmlFor={id}>{label}</label>
        <span id={`${id}-value`} className="tabular-nums" data-value>
          {signalValue(control.key, value as number)}
          <span className="text-ink-3"> (the case: {signalValue(control.key, real as number)})</span>
        </span>
      </div>
      <div className="relative mt-1 flex min-h-6 items-center pointer-coarse:min-h-11">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={control.kind === 'count' ? 1 : 0.01}
          value={Number(value)}
          aria-valuetext={signalValue(control.key, value as number)}
          aria-describedby={`${id}-value`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 h-6 w-full cursor-pointer accent-ink"
        />
        <span
          aria-hidden="true"
          data-real-tick
          style={{ '--at': at } as React.CSSProperties}
          className="pointer-events-none absolute top-1/2 z-20 left-[calc(8px+(100%-16px)*var(--at))] h-3 w-0.5 -translate-y-1/2 bg-pencil-blue"
        />
      </div>
    </div>
  );
}

export function AssayBench({ assay }: { assay: AssayComputed }) {
  const [real] = useState(() => signalsOf(assay));
  const [values, setValues] = useState<Signals>(real);
  const [result, setResult] = useState<AssayComputed>(assay);
  const frame = useRef<number>(0);

  // Recompute on the next animation frame; a newer move cancels an older one, so a drag never queues work.
  const schedule = useCallback(
    (next: Signals) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setResult(whatIf(next, assay.judge_verdict)));
    },
    [assay.judge_verdict],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const set = (key: Key, v: number | string) => {
    const next = { ...values, [key]: v } as Signals;
    setValues(next);
    schedule(next);
  };
  const reset = () => {
    setValues(real);
    cancelAnimationFrame(frame.current);
    setResult(assay);
  };
  const changed = (Object.keys(real) as Key[]).some((k) => values[k] !== real[k]);

  return (
    // Its own link scope: hovering a mark here lights the Bench's ledger, never the one on the tab behind the drawer.
    <AssayLinkProvider>
    <section aria-labelledby="bench-title" data-bench className="flex flex-col gap-4">
      <div>
        <h3 id="bench-title" className="type-ui font-semibold text-ink">
          Try the formula
        </h3>
      </div>

      <div data-bench-result className="flex flex-col gap-3 border-b-(length:--rule) border-sheet-line pb-4 [@media(min-width:48rem)_and_(min-height:46rem)]:sticky [@media(min-width:48rem)_and_(min-height:46rem)]:top-0 [@media(min-width:48rem)_and_(min-height:46rem)]:z-30 [@media(min-width:48rem)_and_(min-height:46rem)]:bg-sheet">
        {/* Inside the sticky block: whatever live numbers are on screen, the label is too (11 §4.5). */}
        <p data-whatif className="border-y-(length:--rule) border-ochre py-2 type-body text-ink">
          What-if. This doesn&apos;t re-run the agents.
        </p>
        <Hallmark metrics={result.metrics} size={28} />
        <p role="status" aria-live="polite" aria-atomic="true" className="type-body text-ink">
          The formula reads <span className="font-semibold">{verdictName(result.formula_verdict)}</span> at an overall score of{' '}
          <span className="tabular-nums" data-bench-composite>
            {result.composite.toFixed(2)}
          </span>
          . The case&apos;s own was {assay.composite.toFixed(2)}.
        </p>
        <TwoKey assay={result} />
        <MaskingNotice assay={result} />
        {result.tipping_point && <p className="type-meta text-ink-2">{tippingSentence(result.tipping_point)}</p>}
        <div>
          <Button variant="secondary" onClick={() => changed && reset()} aria-disabled={!changed} className={changed ? undefined : 'opacity-60'}>
            Reset to the case
          </Button>
        </div>
      </div>

      {(Object.keys(CONTROLS) as SignalGroup[]).map((group) => (
        <fieldset key={group} className="flex flex-col gap-3">
          <legend className="type-meta font-semibold text-ink-2">{group}</legend>
          {CONTROLS[group].map((c) => (
            <Slider key={c.key} control={c} value={values[c.key]} real={real[c.key]} onChange={(v) => set(c.key, v)} />
          ))}
        </fieldset>
      ))}

      {result.ledger && <IntegrityLedger ledger={result.ledger} className="mt-2" />}
    </section>
    </AssayLinkProvider>
  );
}


'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AgreementDial } from '@/components/assay/AgreementDial';
import { whatIf, AssayBench } from '@/components/assay/AssayBench';
import { LineageDiagram } from '@/components/assay/LineageDiagram';
import { agentIdentity } from '@/lib/agents.config';
import { compute, leverage, REFERENCE } from '@/lib/assay/assay';
import { BENCH_SAMPLES } from '@/lib/assay/samples';
import { verdictName } from '@/lib/assay/present';
import { LIMITATIONS, METRICS, OVERALL } from '@/lib/method';

// How ACHP decides (07 §8): a scroll story on paper. Agents → the five scores (full forms first) → where each number
// comes from → how far people agreed → the formula to play with → what we found in our own formulas → the benchmark →
// the limits. Every figure in the findings is computed here by the Assay module from the parity vectors; the
// benchmark is generated from EVALUATION.md's data file. Nothing on this page is a verdict on a real message.

export interface MethodAgent {
  id: string;
  name: string;
  role: string;
  group: string;
}

export interface Benchmark {
  provenance: { note: string };
  headline: { system: string; metric: string; value: number };
  split_columns: string[];
  systems: { name: string; scores: number[]; ours?: boolean }[];
  ablation: { configuration: string; macro: number }[];
  significance: string;
  other_published: { label: string; value: number; note: string }[];
}

const STEPS = [
  { id: 'agents', title: 'The seven agents' },
  { id: 'scores', title: 'The five scores' },
  { id: 'lineage', title: 'Where the numbers come from' },
  { id: 'agreement', title: 'How much people agreed' },
  { id: 'bench', title: 'Try the formula' },
  { id: 'findings', title: 'What we found in our own formulas' },
  { id: 'benchmark', title: 'How well it works' },
  { id: 'limits', title: 'What it cannot do' },
] as const;

const pct = (v: number) => `${v.toFixed(1)}%`;

function Step({ id, title, children, lead }: { id: string; title: string; children: React.ReactNode; lead?: string }) {
  return (
    <section id={id} data-step={id} aria-labelledby={`${id}-title`} tabIndex={-1} className="story-step scroll-mt-20 py-10 outline-none md:py-14">
      <div className="reveal">
        <h2 id={`${id}-title`} className="font-display text-[1.75rem] leading-tight font-medium text-desk-ink [font-variation-settings:'opsz'_36]">
          {title}
        </h2>
        {lead && <p className="mt-2 max-w-[60ch] type-body text-desk-ink-2">{lead}</p>}
      </div>
      <div className="reveal mt-5">{children}</div>
    </section>
  );
}

function Sheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('paper rounded-sheet px-5 py-6 shadow-lift-sheet md:px-8', className)}>{children}</div>;
}

function Contents() {
  const [current, setCurrent] = useState<string>(STEPS[0].id);
  useEffect(() => {
    const els = STEPS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setCurrent(e.target.id)), { rootMargin: '-40% 0px -55% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="On this page" className="2xl:fixed 2xl:top-1/2 2xl:left-[max(1rem,calc(50%-640px))] 2xl:w-44 2xl:-translate-y-1/2">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 2xl:flex-col 2xl:gap-0">
        {STEPS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={current === s.id ? 'step' : undefined}
              className="inline-flex min-h-6 items-center type-meta text-desk-ink-2 underline-offset-4 hover:text-desk-ink aria-[current=step]:font-semibold aria-[current=step]:text-desk-ink pointer-coarse:min-h-11 2xl:min-h-8"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Agents({ agents }: { agents: MethodAgent[] }) {
  // Agents that share a group run side by side (the parallel group), in the order the server lists them.
  const groups: MethodAgent[][] = [];
  for (const a of agents) {
    const last = groups[groups.length - 1];
    if (last && last[0].group === a.group) last.push(a);
    else groups.push([a]);
  }
  const Row = ({ a }: { a: MethodAgent }) => {
    const id = agentIdentity(a.id, a.name);
    const Glyph = id.glyph;
    return (
      <li data-agent-card={a.id} className="flex items-start gap-3 py-2">
        <Glyph className="mt-0.5 size-6 text-ink" />
        <div>
          <p className="type-ui font-semibold text-ink">{a.name}</p>
          <p className="type-body text-ink-2">{a.role}</p>
        </div>
      </li>
    );
  };
  return (
    <Sheet>
      <ol className="flex flex-col">
        {groups.map((g) =>
          g.length > 1 ? (
            <li key={g[0].group} className="my-1 border-l-(length:--rule) border-sheet-line pl-3">
              <p className="pt-1 type-meta text-ink-2">In parallel</p>
              <ol aria-label="These agents work at the same time">
                {g.map((a) => (
                  <Row key={a.id} a={a} />
                ))}
              </ol>
            </li>
          ) : (
            <Row key={g[0].id} a={g[0]} />
          ),
        )}
      </ol>
    </Sheet>
  );
}

function Findings() {
  const quiet = BENCH_SAMPLES.find((s) => s.id === 'quiet_falsehood')!;
  const loaded = BENCH_SAMPLES.find((s) => s.id === 'true_but_loaded')!;
  const q = useMemo(() => compute(quiet.signals, 'code'), [quiet]);
  const l = useMemo(() => compute(loaded.signals, 'code'), [loaded]);
  const lev = useMemo(() => leverage(REFERENCE, 'code'), []);
  const ratio = Math.abs(lev.gradient.s_fr ?? 0) / Math.abs(lev.gradient.fA ?? 1);
  return (
    <Sheet>
      <p className="max-w-[64ch] type-body text-ink">
        We tested our own formulas the way we test a claim. Each finding below is computed by the same code the Assay uses, and a test pins it.
      </p>
      <ol className="mt-4 flex flex-col gap-5">
        <li data-finding="leverage">
          <h3 className="type-ui font-semibold text-ink">Wording moves the overall score more than facts do.</h3>
          <p className="mt-1 max-w-[64ch] type-body text-ink-2">
            Moving the framing score by a tenth moves the overall score about {ratio.toFixed(1)} times as much as moving the Fact Challenger&apos;s factual score by a
            tenth. Framing also feeds four of the five scores; no other signal feeds more than one.
          </p>
        </li>
        <li data-finding="masking">
          <h3 className="type-ui font-semibold text-ink">A calm falsehood can pass the formula.</h3>
          <p className="mt-1 max-w-[64ch] type-body text-ink-2">
            In our sample of a refuted claim written calmly, the Consensus Truth Score is {q.metrics.CTS.toFixed(2)}, yet the overall score is {q.composite.toFixed(2)}, which the
            formula reads as {verdictName(q.formula_verdict)}. The Judge says {verdictName(quiet.judge)}. We call this masking.
          </p>
        </li>
        <li data-finding="reverse">
          <h3 className="type-ui font-semibold text-ink">And a true claim can be pulled down by loaded words.</h3>
          <p className="mt-1 max-w-[64ch] type-body text-ink-2">
            In our sample of a supported claim in alarming wording, the formula reads {verdictName(l.formula_verdict)} at {l.composite.toFixed(2)}. The Judge says {verdictName(loaded.judge)}.
          </p>
        </li>
        <li data-finding="disagree">
          <h3 className="type-ui font-semibold text-ink">So the Judge and the formula can disagree, and we say so.</h3>
          <p className="mt-1 max-w-[64ch] type-body text-ink-2">The stamp is always the Judge&apos;s verdict, made from the sources. The formula is a second opinion, shown beside it as two keys.</p>
        </li>
      </ol>
      <h3 className="mt-6 type-ui font-semibold text-ink">What we did about it</h3>
      <ul className="mt-2 flex max-w-[64ch] list-disc flex-col gap-1 pl-5 type-body text-ink-2 marker:text-ink-3">
        <li>The Judge&apos;s stamp is the headline. The overall score never appears alone, and is never in a heading.</li>
        <li>When wording lifts a score past weak facts, a notice says so above the ledger.</li>
        <li>The Integrity Ledger shows, signal by signal, what raised or lowered the overall score.</li>
        <li>A build check fails if any wording signal gains more than 3.6 times the leverage of the factual attack without a written decision.</li>
      </ul>
    </Sheet>
  );
}

function MethodBench() {
  const [id, setId] = useState<(typeof BENCH_SAMPLES)[number]['id']>('reference');
  const sample = BENCH_SAMPLES.find((s) => s.id === id)!;
  const assay = useMemo(() => whatIf(sample.signals, sample.judge), [sample]);
  return (
    <Sheet>
      <fieldset>
        <legend className="type-meta font-semibold text-ink-2">Pick a sample</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {BENCH_SAMPLES.map((s) => (
            <label
              key={s.id}
              className={cn(
                'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-button border-(length:--rule) px-3 type-ui text-ink pointer-coarse:min-h-11',
                s.id === id ? 'border-ink bg-surface-tint' : 'border-sheet-line',
              )}
            >
              <input type="radio" name="bench-sample" value={s.id} checked={s.id === id} onChange={() => setId(s.id)} className="accent-ink" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p data-sample-shows className="mt-3 max-w-[64ch] type-body text-ink-2">
        {sample.shows} <span className="text-ink-3">These are illustrative signals, not a real check.</span>
      </p>
      <div className="mt-4 border-t-(length:--rule) border-sheet-line pt-4">
        <AssayBench key={id} assay={assay} />
      </div>
    </Sheet>
  );
}

function BenchmarkSection({ b }: { b: Benchmark }) {
  return (
    <Sheet>
      <p data-headline className="font-display text-[2rem] leading-tight font-medium text-ink [font-variation-settings:'opsz'_48]">
        {pct(b.headline.value)} {b.headline.metric}
      </p>
      <p className="mt-1 max-w-[64ch] type-body text-ink-2">
        On the project&apos;s own factual, opinion and prediction claims. {b.provenance.note}
      </p>

      <h3 className="mt-6 type-ui font-semibold text-ink">By kind of claim</h3>
      <div className="mt-2 overflow-x-auto">
        <table data-benchmark-table className="w-full min-w-[30rem] border-collapse type-meta">
          <caption className="sr-only">Accuracy by kind of claim, for ACHP and three baselines</caption>
          <thead>
            <tr className="border-b-(length:--rule) border-ink text-left text-ink-2">
              <th scope="col" className="py-1 pr-3 font-semibold">
                System
              </th>
              {b.split_columns.map((c) => (
                <th key={c} scope="col" className="py-1 pl-3 text-right font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.systems.map((s) => (
              <tr key={s.name} className="border-b-(length:--rule) border-sheet-line">
                <th scope="row" className={cn('py-2 pr-3 text-left', s.ours ? 'font-semibold text-ink' : 'font-normal text-ink')}>
                  {s.name}
                </th>
                {s.scores.map((v, i) => (
                  <td key={i} className="py-2 pl-3 text-right text-ink tabular-nums">
                    {pct(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 type-ui font-semibold text-ink">What each part adds</h3>
      <ol data-ablation className="mt-2 flex flex-col gap-1">
        {b.ablation.map((a) => (
          <li key={a.configuration} className="grid grid-cols-[minmax(0,14rem)_1fr_3.5rem] items-center gap-3 type-meta text-ink">
            <span>{a.configuration}</span>
            <span aria-hidden="true" className="block h-3 border-l-(length:--rule) border-ink-3">
              <span style={{ '--w': `${a.macro}%` } as React.CSSProperties} className="block h-full w-(--w) rounded-r-[4px] bg-mark-neutral" />
            </span>
            <span className="text-right tabular-nums">{pct(a.macro)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 max-w-[64ch] type-meta text-ink-2">{b.significance}</p>

      <h3 className="mt-6 type-ui font-semibold text-ink">Other figures you may have seen</h3>
      <ul className="mt-2 flex max-w-[64ch] flex-col gap-1 type-body text-ink-2">
        {b.other_published.map((o) => (
          <li key={o.label}>
            <span className="font-semibold text-ink">
              {o.label}: {pct(o.value)}.
            </span>{' '}
            {o.note}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function MethodPage({ agents, benchmark }: { agents: MethodAgent[]; benchmark: Benchmark }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[880px] flex-1 px-4 pt-8 pb-24 outline-none md:px-6 md:pt-12">
      <h1 className="font-display text-[2.25rem] leading-tight font-medium text-balance text-desk-ink md:text-[2.75rem] [font-variation-settings:'opsz'_60]">
        How ACHP decides
      </h1>
      <p className="mt-3 max-w-[60ch] type-body text-desk-ink-2">
        Seven agents, five scores and one stamp, and what we found when we tested our own formulas. Scroll, or jump to a part.
      </p>
      <div className="mt-6">
        <Contents />
      </div>

      <Step id="agents" title={STEPS[0].title} lead="Each one has a single job, and you can watch it do it on any case.">
        <Agents agents={agents} />
      </Step>

      <Step id="scores" title={STEPS[1].title} lead="Each score is spelled out the first time it appears. The Judge's stamp is the headline; these describe how the message is built.">
        <Sheet>
          <ol className="flex flex-col gap-5">
            {METRICS.map((m) => (
              <li key={m.acronym} data-metric-doc={m.acronym}>
                <h3 className="type-ui font-semibold text-ink">
                  {m.name} ({m.acronym}){m.note && <span className="font-normal text-ink-2">, {m.note}</span>}
                </h3>
                <p className="mt-1 max-w-[64ch] type-body text-ink">{m.means}</p>
                <p className="mt-1 max-w-[64ch] type-meta text-ink-2">{m.formula}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-[64ch] border-t-(length:--rule) border-sheet-line pt-4 type-body text-ink-2">
            <span className="font-semibold text-ink">The overall score.</span> {OVERALL.formula}. {OVERALL.caution}
          </p>
        </Sheet>
      </Step>

      <Step id="lineage" title={STEPS[2].title} lead="Switch between the formulas in the paper and the formulas in the code, and see where they differ.">
        <Sheet>
          <LineageDiagram />
        </Sheet>
      </Step>

      <Step id="agreement" title={STEPS[3].title}>
        <Sheet>
          <AgreementDial />
        </Sheet>
      </Step>

      <Step id="bench" title={STEPS[4].title} lead="Move a signal and the formula recomputes. It is a what-if: it never re-runs an agent and it is never a verdict on a real message.">
        <MethodBench />
      </Step>

      <Step id="findings" title={STEPS[5].title}>
        <Findings />
      </Step>

      <Step id="benchmark" title={STEPS[6].title} lead="One headline number, the split behind it, and what each agent adds.">
        <BenchmarkSection b={benchmark} />
      </Step>

      <Step id="limits" title={STEPS[7].title}>
        <Sheet>
          <ul className="flex max-w-[64ch] list-disc flex-col gap-2 pl-5 type-body text-ink marker:text-ink-3">
            {LIMITATIONS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Sheet>
        <p className="mt-6">
          <Link href="/" className="inline-flex min-h-11 items-center type-ui text-desk-ink underline decoration-(length:--rule) underline-offset-4">
            Check a message
          </Link>
        </p>
      </Step>
    </main>
  );
}

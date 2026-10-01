'use client';

import { Info } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CONFIDENCE_RULES, CONFIDENCE_SOURCE, LIMITATIONS, METRICS, OVERALL } from '@/lib/method';

// "How we decided": the metrics with their full forms, definitions and formulas, the
// confidence-band rules, the benchmark and the limits. Reference material, on paper. No radar.
// The Assay tab goes deeper for this case; /method (P9) will for the whole method.

export function MethodDrawer({ benchmark, onOpenAssay }: { benchmark: string | null; onOpenAssay?: () => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 type-meta text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
        >
          <Info aria-hidden="true" className="size-3.5 stroke-[1.5]" />
          How we decided
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(92vw,520px)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How ACHP decides</SheetTitle>
          <SheetDescription>
            Seven agents look at the message. The Judge&apos;s stamp is the verdict; the scores below describe how it was
            reached.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-8 px-4 pb-8">
          <section aria-labelledby="m-scores">
            <h3 id="m-scores" className="type-ui font-semibold text-ink">
              The five scores
            </h3>
            <dl className="mt-3 flex flex-col gap-4">
              {METRICS.map((m) => (
                <div key={m.acronym}>
                  <dt className="type-ui font-semibold text-ink">
                    {m.name} ({m.acronym})
                    {m.note && <span className="font-normal text-ink-2"> · {m.note}</span>}
                  </dt>
                  <dd className="mt-1 type-body text-ink-2">{m.means}</dd>
                  <dd className="mt-1 type-meta text-ink-2">{m.formula}</dd>
                  <dd className="type-meta text-ink-3">{m.source}</dd>
                </div>
              ))}
              <div>
                <dt className="type-ui font-semibold text-ink">The overall score</dt>
                <dd className="mt-1 type-meta text-ink-2">{OVERALL.formula}</dd>
                <dd className="type-meta text-ink-3">{OVERALL.source}</dd>
                <dd className="mt-1 type-body text-ink-2">{OVERALL.caution}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="m-band">
            <h3 id="m-band" className="type-ui font-semibold text-ink">
              How sure ACHP is
            </h3>
            <ul className="mt-3 list-disc pl-5 marker:text-ink-3">
              {CONFIDENCE_RULES.map((r) => (
                <li key={r} className="type-body text-ink-2">
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-2 type-meta text-ink-3">{CONFIDENCE_SOURCE}</p>
          </section>

          <section aria-labelledby="m-bench">
            <h3 id="m-bench" className="type-ui font-semibold text-ink">
              How well it works
            </h3>
            <p className="mt-3 max-w-[68ch] type-body text-ink-2">
              {benchmark ??
                'No benchmark is published yet. The comparison with human raters will appear here once the evaluation report is generated; ACHP does not quote figures it cannot point to.'}
            </p>
          </section>

          {onOpenAssay && (
            <SheetClose asChild>
              <button
                type="button"
                onClick={onOpenAssay}
                className="inline-flex min-h-6 w-fit cursor-pointer items-center type-ui text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
              >
                See how this case&apos;s scores were reached (the Assay tab)
              </button>
            </SheetClose>
          )}

          <section aria-labelledby="m-limits">
            <h3 id="m-limits" className="type-ui font-semibold text-ink">
              What ACHP cannot do
            </h3>
            <ul className="mt-3 list-disc pl-5 marker:text-ink-3">
              {LIMITATIONS.map((l) => (
                <li key={l} className="type-body text-ink-2">
                  {l}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

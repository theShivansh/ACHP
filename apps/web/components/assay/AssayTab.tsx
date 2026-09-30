import { HUMAN_AGREEMENT_R, METRIC_INFO, METRICS, score100 } from '@/lib/assay/present';
import type { AssayComputed } from '@/lib/runs/types';
import { AssayDrawers } from './AssayDrawers';
import { Hallmark } from './Hallmark';
import { IntegrityLedger } from './IntegrityLedger';
import { MaskingNotice } from './MaskingNotice';
import { MetricTerm } from './MetricTerm';
import { TippingLine } from './TippingLine';
import { TwoKey } from './TwoKey';

// The Assay tab (07 §4.1): how the five scores were reached, and whether they agree with the verdict.
// Everything here is the server's `assay.computed` (nothing is recomputed in the browser). The composite
// appears only in context: the Two-Key sentence, the masking notice, the tipping line and the ledger.

/** The Hallmark's table twin: every metric in full on first use, its score, its direction and how far humans agreed. */
function Legend({ assay }: { assay: AssayComputed }) {
  return (
    <table data-legend className="mt-3 w-full border-collapse type-meta">
      <caption className="sr-only">The five scores in full, with how far humans agreed with each</caption>
      <thead>
        <tr className="border-b-(length:--rule) border-ink text-left text-ink-2">
          <th scope="col" className="py-1 pr-3 font-semibold">
            Score
          </th>
          <th scope="col" className="py-1 pr-3 text-right font-semibold">
            Value
          </th>
          <th scope="col" className="hidden py-1 pr-3 font-semibold md:table-cell">
            Measures
          </th>
          <th scope="col" className="w-24 py-1 text-right font-semibold">
            <span className="sr-only">Human </span>Agreement
          </th>
        </tr>
      </thead>
      <tbody>
        {METRICS.map((code) => (
          <tr key={code} data-metric={code} className="border-b-(length:--rule) border-sheet-line align-top">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
              <MetricTerm code={code} full />
            </th>
            <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{score100(assay.metrics[code])}</td>
            <td className="hidden py-1.5 pr-3 text-ink-2 md:table-cell">{METRIC_INFO[code].measures}</td>
            <td className="py-1.5 text-right tabular-nums text-ink-2">{HUMAN_AGREEMENT_R[code].toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AssayTab({ assay }: { assay: AssayComputed | null }) {
  if (!assay) {
    return (
      <section aria-labelledby="assay-title" data-assay="none">
        <h2 id="assay-title" className="type-h2 text-ink">
          The Assay
        </h2>
        <p className="mt-2 max-w-[60ch] type-body text-ink-2">
          This check has no score readout. It was recorded before the Assay existed, so the five scores and the
          ledger behind them were never stored.
        </p>
      </section>
    );
  }
  const metricsOnly = assay.mode === 'metrics_only';
  return (
    <section aria-labelledby="assay-title" data-assay={assay.mode} className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="assay-title" className="type-h2 text-ink">
            The Assay
          </h2>
          <p className="mt-1 max-w-[60ch] type-body text-ink-2">
            How the five scores were reached, and whether they agree with the verdict.
          </p>
        </div>
        <p className="type-meta text-ink-3">Formula version {assay.formula_version}</p>
      </header>

      <Hallmark metrics={assay.metrics} size={40} />
      <TwoKey assay={assay} />
      <MaskingNotice assay={assay} />

      <div>
        <Legend assay={assay} />
        <p className="mt-2 max-w-[68ch] type-meta text-ink-3">
          Agreement is how closely the score tracked 200 human-annotated claims (Pearson r). It is agreement, not accuracy or
          confidence. The finer outline marks the scores humans agreed with least.
        </p>
      </div>

      {metricsOnly ? (
        <p data-assay-note className="max-w-[60ch] type-body text-ink-2">
          This test log carries only the five published scores, so there is no ledger and no tipping point.
        </p>
      ) : (
        <>
          <TippingLine assay={assay} />
          {assay.ledger && <IntegrityLedger ledger={assay.ledger} />}
        </>
      )}

      <AssayDrawers assay={assay} />
    </section>
  );
}

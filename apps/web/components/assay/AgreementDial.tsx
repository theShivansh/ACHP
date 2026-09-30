import { HUMAN_AGREEMENT_R, METRIC_INFO, METRICS } from '@/lib/assay/present';
import { MetricTerm } from './MetricTerm';

// The Agreement Dial (04 §7.1, 11 §3.7): how far people agreed with each score in the paper's calibration
// (Pearson r against 200 human-annotated claims). Five single-hue bars on a 0–1 axis with the value at the
// tip. It is agreement, never accuracy or confidence. The table is its own twin: the bars are decoration.

export function AgreementDial() {
  return (
    <section aria-labelledby="agreement-title" data-agreement>
      <h3 id="agreement-title" className="type-ui font-semibold text-ink">
        How much humans agreed
      </h3>
      <p className="mt-1 max-w-[60ch] type-body text-ink-2">Agreement with 200 human-annotated claims (Pearson r).</p>
      <table className="mt-3 w-full border-collapse type-meta">
        <caption className="sr-only">Human agreement with each score, from 0 to 1</caption>
        <thead>
          <tr className="border-b-(length:--rule) border-ink text-left text-ink-2">
            <th scope="col" className="w-2/5 py-1 pr-3 font-semibold">
              Score
            </th>
            <th scope="col" className="py-1 pr-3 font-semibold">
              <span className="sr-only">Bar from 0 to 1</span>
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              r
            </th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((code) => (
            <tr key={code} data-metric={code} className="border-b-(length:--rule) border-sheet-line">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                <MetricTerm code={code} full />
              </th>
              <td className="py-2 pr-3">
                <span aria-hidden="true" className="relative block h-3 w-full border-l-(length:--rule) border-ink-3">
                  <span
                    style={{ '--w': `${HUMAN_AGREEMENT_R[code] * 100}%` } as React.CSSProperties}
                    className="block h-full w-(--w) rounded-r-[4px] bg-mark-neutral"
                  />
                </span>
              </td>
              <td className="py-2 text-right tabular-nums text-ink">{METRIC_INFO[code].r.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden="true" className="mt-1 ml-[40%] flex justify-between pr-10 type-meta text-ink-3 tabular-nums">
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
      <p className="mt-3 max-w-[60ch] type-meta text-ink-2">
        Bias is the hardest to measure; humans agreed least with it. Agreement is not accuracy and not confidence in a
        verdict.
      </p>
    </section>
  );
}

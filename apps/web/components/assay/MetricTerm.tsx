import { METRIC_INFO, type MetricName } from '@/lib/assay/present';

/**
 * A metric in running text (04 §7.1). The first use in a view spells it out ("Bias Impact Score (BIS,
 * lower is better)"); later uses are the acronym with its full form on hover and to screen readers.
 * The view decides which use is the first: it passes `full` once, then leaves it off.
 */
export function MetricTerm({ code, full = false }: { code: MetricName; full?: boolean }) {
  const m = METRIC_INFO[code];
  if (full) {
    return (
      <span data-metric-term={code} data-full>
        {m.full} ({code}
        {m.lowerIsBetter ? ', lower is better' : ''})
      </span>
    );
  }
  return (
    <abbr
      data-metric-term={code}
      title={`${m.full}${m.lowerIsBetter ? ' (lower is better)' : ''}`}
      className="cursor-help underline decoration-dotted decoration-(length:--rule) underline-offset-4"
    >
      {code}
    </abbr>
  );
}

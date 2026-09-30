import { cn } from 'cn';
import { ledgerGroups, ledgerSplit, signalValue, signalWords, signed } from '@/lib/assay/present';
import type { AssayLedger } from '@/lib/runs/types';

// The Integrity Ledger (04 §7.1, 11 §3.3): "why this overall score?" as double-entry accounting. It opens
// with the balance of a reference claim whose every signal sits at its midpoint, posts one line per raw
// signal as a credit (it pushed the score up) or a debit (pulled it down), and closes at this case's
// score. Exact Shapley shares, so the books balance for any formula. Facts are pinned to the top: "the
// facts moved it −0.06, the wording moved it +0.21" is one glance. Amounts use text tokens; only the
// margin bars use the chart colors, with a two-pixel gap and a square end at the zero line.

const three = (n: number) => n.toFixed(3);

function Bar({ amount, max }: { amount: number; max: number }) {
  const share = max > 0 ? Math.min(1, Math.abs(amount) / max) : 0;
  const credit = amount >= 0;
  return (
    <span aria-hidden="true" className="relative block h-3 w-full">
      <span className="absolute inset-y-0 left-1/2 w-px bg-ink-3" />
      <span
        style={{ '--w': `${(share * 50).toFixed(1)}%` } as React.CSSProperties}
        className={cn(
          'absolute inset-y-0.5 w-(--w)',
          credit ? 'left-[calc(50%+2px)] rounded-r-[4px] bg-mark-credit' : 'right-[calc(50%+2px)] rounded-l-[4px] bg-mark-debit',
        )}
      />
    </span>
  );
}

export function IntegrityLedger({ ledger, className }: { ledger: AssayLedger; className?: string }) {
  const groups = ledgerGroups(ledger.entries);
  const max = Math.max(1e-9, ...ledger.entries.map((e) => Math.abs(e.amount)));
  const { facts, other } = ledgerSplit(ledger.entries);
  return (
    <section aria-labelledby="ledger-title" data-ledger className={cn('max-w-[68ch]', className)}>
      <h3 id="ledger-title" className="type-ui font-semibold text-ink">
        Integrity ledger
      </h3>
      <p className="mt-1 type-body text-ink-2">
        Why this overall score? Compared with a claim where every signal sits at its midpoint.{' '}
        <span data-ledger-split>
          The facts moved it {signed(facts)}; the wording and the rest moved it {signed(other)}.
        </span>
      </p>

      <table className="mt-3 w-full border-collapse type-meta">
        <caption className="sr-only">
          How each signal moved the overall score, from the opening balance to the closing balance
        </caption>
        <thead>
          <tr className="border-b-(length:--rule) border-ink text-left text-ink-2">
            <th scope="col" className="py-1 pr-3 font-semibold">
              Signal
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-semibold">
              Value
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-semibold">
              Debit
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Credit
            </th>
            <th scope="col" className="hidden w-32 py-1 pl-3 font-semibold md:table-cell">
              Effect
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b-(length:--rule) border-sheet-line">
            <th scope="row" colSpan={3} className="py-2 pr-3 text-left font-normal text-ink">
              Opening balance <span className="text-ink-2">(a claim with every signal at its midpoint)</span>
            </th>
            <td className="py-2 text-right tabular-nums text-ink">
              <span className="sr-only">balance </span>
              {three(ledger.opening_balance)}
            </td>
            <td className="hidden md:table-cell" />
          </tr>
        </tbody>
        {groups.map((g) => (
          <GroupRows key={g.group} group={g.group} rows={g.rows} max={max} />
        ))}
        <tfoot>
          <tr className="border-t-[3px] border-double border-ink">
            <th scope="row" colSpan={3} className="py-2 pr-3 text-left font-semibold text-ink">
              Closing balance <span className="font-normal text-ink-2">= the overall score</span>
            </th>
            <td className="py-2 text-right tabular-nums text-ink" data-closing>
              {three(ledger.closing_balance)}
            </td>
            <td className="hidden md:table-cell" />
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 type-meta text-ink-3">
        Shares are exact (Shapley values) and shown to three decimals; the exact figures are in the Trace. The opening
        balance plus every line is the closing balance.
      </p>
    </section>
  );
}

function GroupRows({
  group,
  rows,
  max,
}: {
  group: string;
  rows: AssayLedger['entries'];
  max: number;
}) {
  return (
    <tbody>
      <tr>
        <th scope="rowgroup" colSpan={5} className="pt-3 pb-1 text-left font-semibold text-ink">
          {group}
        </th>
      </tr>
      {rows.map((e) => (
        <tr key={e.signal} data-signal={e.signal} className="border-b-(length:--rule) border-sheet-line">
          <th scope="row" className="py-1 pr-3 pl-3 text-left font-normal text-ink">
            {signalWords(e.signal)}
          </th>
          <td className="py-1 pr-3 text-right tabular-nums text-ink-2">{signalValue(e.signal, e.value)}</td>
          <td className="py-1 pr-3 text-right tabular-nums text-ink">
            {e.amount < 0 ? signed(e.amount) : <span className="sr-only">none</span>}
          </td>
          <td className="py-1 text-right tabular-nums text-ink">
            {e.amount >= 0 ? signed(e.amount) : <span className="sr-only">none</span>}
          </td>
          <td className="hidden py-1 pl-3 md:table-cell">
            <Bar amount={e.amount} max={max} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

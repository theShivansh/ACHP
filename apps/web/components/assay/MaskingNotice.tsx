import { cn } from 'cn';
import { maskingCopy } from '@/lib/assay/present';
import type { AssayComputed } from '@/lib/runs/types';

/**
 * The Truth-first notice (11 §4): a refuted claim written calmly can earn a passing composite, and the
 * report says so. A ruled notice (an ochre rule above and below, no box, no icon), placed under the
 * Two-Key. The Judge's stamp keeps the headline. The index is labelled experimental until 11 §5 lands.
 */
export function MaskingNotice({ assay, className }: { assay: AssayComputed; className?: string }) {
  const copy = maskingCopy(assay);
  if (!copy) return null;
  return (
    <aside data-masking aria-label="Why the score and the verdict differ" className={cn('border-y-(length:--rule) border-ochre py-4', className)}>
      <p className="max-w-[68ch] type-body text-ink">
        <span className="font-semibold">{copy.lead}</span> {copy.body}
      </p>
      <p className="mt-1 type-meta text-ink-2">{copy.index}</p>
    </aside>
  );
}

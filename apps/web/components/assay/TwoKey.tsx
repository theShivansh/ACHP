import { cn } from 'cn';
import { twoKeyCopy } from '@/lib/assay/present';
import type { AssayComputed } from '@/lib/runs/types';

// The Two-Key Verdict (04 §7.1, 11 §3.2): a verdict is sealed only when both keys turn. Key 1 is the
// Judge (the headline stamp), key 2 is the published formula. It turns fully when they agree, halfway
// on a close call and not at all on a split. Static here; the turn is drawn in P8.

const TURN = { agree: 90, adjacent: 45, split: 0 } as const;

function Key({ turn, label }: { turn: number; label: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5" data-key={label.toLowerCase()} data-turn={turn}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 28 28" width="28" height="28" className="overflow-visible">
        <g transform={`rotate(${turn} 14 14)`} className="stroke-ink" fill="none" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="14" cy="8" r="4" />
          <path d="M14 12 V25 M14 20 H18 M14 24 H17" />
        </g>
      </svg>
      <span className="type-meta text-ink-2">{label}</span>
    </span>
  );
}

/** Two keys and one sentence. Nothing shows when the formula wasn't compared (a part the sources didn't settle). */
export function TwoKey({ assay, className }: { assay: AssayComputed; className?: string }) {
  const copy = twoKeyCopy(assay.two_key, assay.composite);
  if (!copy) return null;
  const formulaTurn = TURN[copy.state as keyof typeof TURN] ?? 0;
  return (
    <div data-two-key={copy.state} className={cn('flex items-center gap-4', className)}>
      <div aria-hidden="true" className="flex items-start gap-3">
        <Key turn={90} label="Judge" />
        <Key turn={formulaTurn} label="Formula" />
      </div>
      <p className="max-w-[60ch] type-body text-ink">{copy.text}</p>
    </div>
  );
}

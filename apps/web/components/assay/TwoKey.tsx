'use client';

import { cn } from 'cn';
import { twoKeyCopy, TWO_KEY_STANDS, verdictName } from '@/lib/assay/present';
import type { AssayComputed } from '@/lib/runs/types';
import { usePlayOnce } from '@/components/case/arrival';

// The Two-Key Verdict (04 §7.1, 11 §3.2): a verdict is sealed only when both keys turn. Key 1 is the
// Judge (the headline stamp), key 2 is the published formula. The formula's key turns fully when they
// agree, halfway on a close call and not at all on a split. Each key names the verdict it holds, so the
// glyph is never the only carrier; the sentence says the same in words. When the Bench moves the formula's reading,
// the key turns in two stepped frames (05 §4.2). When the Assay arrives while you watch, both keys turn from upright
// after the Hallmark's punch, the Judge's first, two frames each (05 §3.4); a stored case shows them turned.

const TURN = { agree: 90, adjacent: 45, split: 0 } as const;

function Key({ turn, label, verdict, at }: { turn: number; label: string; verdict: string; at: number }) {
  return (
    <span
      className="inline-flex flex-col items-center gap-0.5"
      data-key={label.toLowerCase()}
      data-turn={turn}
      style={{ '--key-at': at } as React.CSSProperties}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 28 28" width="32" height="32" className="overflow-visible">
        <g
          data-key-glyph
          style={{ '--turn': `${turn}deg` } as React.CSSProperties}
          className="key-turn stroke-ink"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="14" cy="8" r="4" />
          <path d="M14 12 V25 M14 20 H18 M14 24 H17" />
        </g>
      </svg>
      <span className="type-meta text-ink-2">{label}</span>
      <span className="type-meta font-semibold text-ink">{verdict}</span>
    </span>
  );
}

/** Two keys and one sentence. Nothing shows when the formula wasn't compared (a part the sources didn't settle). */
export function TwoKey({ assay, arrive = false, className }: { assay: AssayComputed; /** The report's keys: turn them on arrival. */ arrive?: boolean; className?: string }) {
  const copy = twoKeyCopy(assay.two_key, assay.composite);
  const play = usePlayOnce('two-key', arrive);
  if (!copy) return null;
  const formulaTurn = TURN[copy.state as keyof typeof TURN] ?? 0;
  return (
    <div data-two-key={copy.state} data-arrive={play || undefined} className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)}>
      <div aria-hidden="true" className="flex items-start gap-5">
        <Key turn={90} label="Judge" verdict={verdictName(assay.two_key.judge)} at={11} />
        <Key turn={formulaTurn} label="Formula" verdict={verdictName(assay.two_key.formula)} at={13} />
      </div>
      <div className="min-w-0 basis-64 flex-1">
        <p className="max-w-[60ch] type-body text-ink">{copy.text}</p>
        {copy.state !== 'agree' && (
          <p data-stands className="mt-1 max-w-[60ch] type-meta text-ink-2">
            {TWO_KEY_STANDS}
          </p>
        )}
      </div>
    </div>
  );
}

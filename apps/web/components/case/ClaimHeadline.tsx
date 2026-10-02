'use client';

import { cn } from 'cn';
import { useLayoutEffect, useRef, useState } from 'react';
import { measureSpan, type MarkRect } from '@/lib/marks/measure';
import type { Label } from '@/lib/runs/types';
import { usePlayOnce } from './arrival';
import { VerdictMark } from './VerdictMark';

// The forwarded message as the case's headline, with the Framing Lens's highlighter over the words its wording checks
// flagged (signal.computed spans over the input: loaded words, absolutes). A highlight is swiped on left → right in 5
// stepped frames when its check arrives while you watch (05 §3.4), and is simply there otherwise. The words stay
// crisp; the highlight blends with them (multiply in light, screen in dark). The flagged words are said in text by
// `flaggedWordsSentence`, outside the headline (the headline is the shared element of the Desk → Case morph).
//
// Once the Judge has ruled, each part that did not come out Supported carries its own verdict mark (04 §3.3: a half
// underline for Mixed, a dashed box for Unverifiable, a strike for Contradicted, a caret for Missing context) over its
// own words in the message, so the stamp below it answers "which part?" without a scroll. The same mark is on the part's
// strip further down.

function Highlight({ rect, spanKey, line }: { rect: MarkRect; spanKey: string; line: number }) {
  const play = usePlayOnce(`hl:${spanKey}`);
  return (
    <span
      aria-hidden="true"
      data-highlight={spanKey}
      data-play={play || undefined}
      className="hl pointer-events-none absolute top-(--y) left-(--x) h-(--h) w-(--w) rounded-[2px]"
      style={
        {
          '--x': `${rect.x - 1}px`,
          // A marker stroke through the lower half of the letters, not a selection box: it never bridges two lines.
          '--y': `${rect.y + rect.height * 0.42}px`,
          '--w': `${rect.width + 2}px`,
          '--h': `${rect.height * 0.46}px`,
          // A wrapped span: the next line's swipe starts when the line before it ends.
          '--at': `calc(${line * 5} * var(--fps-stop))`,
        } as React.CSSProperties
      }
    />
  );
}

export interface RuledPart {
  claimId: string;
  /** The part's [start, end) range in the message (`claim.extracted` source_span). */
  span: readonly [number, number];
  label: Label;
}

export function ClaimHeadline({
  text,
  spans,
  ruled = [],
  className,
}: {
  text: string;
  /** Flagged [start, end) ranges of `text`, merged and in order (reducer `flaggedSpans`). */
  spans: readonly { span: readonly [number, number] }[];
  /** The parts that did not come out Supported, once the Judge has ruled. */
  ruled?: readonly RuledPart[];
  className?: string;
}) {
  const boxRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [rects, setRects] = useState<{ key: string; rects: MarkRect[] }[]>([]);
  const [ruledRects, setRuledRects] = useState<{ key: string; part: RuledPart; rects: MarkRect[] }[]>([]);
  const spanList = spans.map((s) => `${s.span[0]}-${s.span[1]}`).join(',');
  const ruledList = ruled.map((r) => `${r.claimId}:${r.label}:${r.span[0]}-${r.span[1]}`).join(',');

  useLayoutEffect(() => {
    const box = boxRef.current;
    const node = textRef.current?.firstChild;
    if (!box || !(node instanceof Text) || (!spanList && !ruledList)) return;
    const ranges = spanList ? spanList.split(',').map((k) => k.split('-').map(Number) as [number, number]) : [];
    const parts = ruledList
      ? ruledList.split(',').map((k) => {
          const [claimId, label, range] = k.split(':');
          return { claimId, label: label as Label, span: range.split('-').map(Number) as [number, number] };
        })
      : [];
    const measure = () => {
      setRects(ranges.map((r) => ({ key: `${r[0]}-${r[1]}`, rects: measureSpan(node, r, box) })));
      setRuledRects(parts.map((part) => ({ key: `${part.claimId}:${part.label}`, part, rects: measureSpan(node, part.span, box) })));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [spanList, ruledList, text]);

  const current = new Set(spanList.split(','));
  const currentRuled = new Set(ruledList.split(',').map((k) => k.split(':').slice(0, 2).join(':')));
  return (
    <h1 ref={boxRef} dir="auto" className={cn('relative', className)}>
      <span ref={textRef}>{text}</span>
      {rects
        .filter(({ key }) => current.has(key))
        .map(({ key, rects: lines }) =>
          lines.map((rect, i) => <Highlight key={`${key}-${i}`} rect={rect} spanKey={key} line={i} />),
        )}
      {ruledRects
        .filter(({ key }) => currentRuled.has(key))
        .map(({ key, part, rects: lines }) =>
          lines.map((rect, i) => (
            <VerdictMark key={`${key}-${i}`} rect={rect} label={part.label} line={i} seed={`headline-${part.claimId}`} strike />
          )),
        )}
    </h1>
  );
}

/** The highlighted words, in text ("Wording flagged as loaded or absolute: "just", "enough"."), or null when none. */
export function flaggedWordsSentence(text: string, spans: readonly { span: readonly [number, number] }[]): string | null {
  const words = spans.map((s) => text.slice(s.span[0], s.span[1]).trim()).filter(Boolean);
  return words.length ? `Wording flagged as loaded or absolute: ${words.map((w) => `"${w}"`).join(', ')}.` : null;
}

/**
 * What the highlight means, said under the verdict (never above it): it marks how the message is worded, not whether
 * it is true. A highlight with no key reads as "these words are wrong" (P8 design review). The swatch repeats the mark;
 * the sentence carries it, and names the words for screen readers.
 */
export function HighlightKey({
  text,
  spans,
  className,
}: {
  text: string;
  spans: readonly { span: readonly [number, number] }[];
  className?: string;
}) {
  const words = flaggedWordsSentence(text, spans);
  if (!words) return null;
  return (
    <p data-highlight-key className={cn('flex max-w-[68ch] items-baseline gap-2 type-meta text-ink-2', className)}>
      <span aria-hidden="true" className="hl inline-block h-2 w-5 shrink-0 translate-y-px rounded-[2px]" />
      <span>
        Highlighted: loaded or absolute wording the wording checks flagged. It is about tone, not about whether the
        message is true.<span className="sr-only"> {words}</span>
      </span>
    </p>
  );
}

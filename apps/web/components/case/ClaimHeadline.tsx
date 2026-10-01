'use client';

import { cn } from 'cn';
import { useLayoutEffect, useRef, useState } from 'react';
import { measureSpan, type MarkRect } from '@/lib/marks/measure';
import { usePlayOnce } from './arrival';

// The forwarded message as the case's headline, with the Framing Lens's highlighter over the words its wording checks
// flagged (signal.computed spans over the input: loaded words, absolutes). A highlight is swiped on left → right in 5
// stepped frames when its check arrives while you watch (05 §3.4), and is simply there otherwise. The words stay
// crisp; the highlight blends with them (multiply in light, screen in dark). The flagged words are said in text by
// `flaggedWordsSentence`, outside the headline (the headline is the shared element of the Desk → Case morph).

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
          '--y': `${rect.y + rect.height * 0.12}px`,
          '--w': `${rect.width + 2}px`,
          '--h': `${rect.height * 0.8}px`,
          // A wrapped span: the next line's swipe starts when the line before it ends.
          '--at': `calc(${line * 5} * var(--fps-stop))`,
        } as React.CSSProperties
      }
    />
  );
}

export function ClaimHeadline({
  text,
  spans,
  className,
}: {
  text: string;
  /** Flagged [start, end) ranges of `text`, merged and in order (reducer `flaggedSpans`). */
  spans: readonly { span: readonly [number, number] }[];
  className?: string;
}) {
  const boxRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [rects, setRects] = useState<{ key: string; rects: MarkRect[] }[]>([]);
  const spanList = spans.map((s) => `${s.span[0]}-${s.span[1]}`).join(',');

  useLayoutEffect(() => {
    const box = boxRef.current;
    const node = textRef.current?.firstChild;
    if (!box || !(node instanceof Text) || !spanList) return;
    const ranges = spanList.split(',').map((k) => k.split('-').map(Number) as [number, number]);
    const measure = () => setRects(ranges.map((r) => ({ key: `${r[0]}-${r[1]}`, rects: measureSpan(node, r, box) })));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [spanList, text]);

  const current = new Set(spanList.split(','));
  return (
    <h1 ref={boxRef} className={cn('relative', className)}>
      <span ref={textRef}>{text}</span>
      {rects
        .filter(({ key }) => current.has(key))
        .map(({ key, rects: lines }) =>
          lines.map((rect, i) => <Highlight key={`${key}-${i}`} rect={rect} spanKey={key} line={i} />),
        )}
    </h1>
  );
}

/** The highlighted words, in text ("Wording flagged as loaded or absolute: "just", "enough"."), or null when none. */
export function flaggedWordsSentence(text: string, spans: readonly { span: readonly [number, number] }[]): string | null {
  const words = spans.map((s) => text.slice(s.span[0], s.span[1]).trim()).filter(Boolean);
  return words.length ? `Wording flagged as loaded or absolute: ${words.map((w) => `"${w}"`).join(', ')}.` : null;
}

'use client';

import { cn } from 'cn';
import { useLayoutEffect, useRef, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { measureSpan, type MarkRect } from '@/lib/marks/measure';
import { labelWords } from '@/lib/runs/announcer';
import type { ClaimStrip as Strip, StripEvidence } from '@/lib/runs/reducer';
import type { Label } from '@/lib/runs/types';
import { Mark, markInk } from './Mark';

// One checkable part of the message, cut into a strip (S3.4). The text is the part exactly as the
// Decomposer extracted it; marks sit over the characters of their span (S3.5). The row reserves
// its height for the evidence line and the verdict slot, so nothing below moves when they fill.

const LABEL_TONE: Record<Label, 'support' | 'contradicted' | 'ochre' | 'graphite'> = {
  supported: 'support',
  contradicted: 'contradicted',
  mixed: 'ochre',
  missing_context: 'ochre',
  unverifiable: 'graphite',
  blocked: 'graphite',
};

interface Measured {
  seq: number;
  rects: MarkRect[];
}

export function ClaimStrip({
  strip,
  part,
  evidence,
  label,
  onShowEvidence,
}: {
  strip: Strip;
  part: number;
  evidence: StripEvidence;
  /** The Judge's label for this part, once verdict.final has arrived. */
  label: Label | null;
  onShowEvidence: (claimId: string) => void;
}) {
  const boxRef = useRef<HTMLParagraphElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [measured, setMeasured] = useState<Measured[]>([]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const node = textRef.current?.firstChild;
    if (!box || !(node instanceof Text)) return;
    const measure = () =>
      setMeasured(strip.marks.map((m) => ({ seq: m.seq, rects: measureSpan(node, m.span, box) })));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [strip.marks, strip.text]);

  const notes = strip.marks.filter((m) => m.note);

  return (
    <li
      data-claim={strip.claim_id}
      className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 border-t-(length:--rule) border-sheet-line py-6 md:grid-cols-[1.5rem_minmax(0,1fr)_120px] animate-[fade-in_var(--dur-base)_var(--ease-out)]"
    >
      <span className="pt-1 type-meta text-ink-3 tabular-nums" aria-hidden="true">
        {part}
      </span>
      <div className="min-w-0">
        <p ref={boxRef} className="relative font-display type-strip text-ink">
          <span className="sr-only">Part {part}: </span>
          <span ref={textRef}>{strip.text}</span>
          {strip.marks.map((m) =>
            (measured.find((x) => x.seq === m.seq)?.rects ?? []).map((rect, i) => (
              <Mark
                key={`${m.seq}-${i}`}
                rect={rect}
                relation={m.relation}
                ink={markInk(m.agent, m.relation)}
                line={i}
                span={m.span}
              />
            )),
          )}
        </p>
        {strip.marks.length > 0 && (
          <p className="sr-only">
            Marked:{' '}
            {strip.marks
              .map((m) => `${m.relation.replace(/_/g, ' ')} "${strip.text.slice(m.span[0], m.span[1])}"`)
              .join('; ')}
            .
          </p>
        )}

        {/* Evidence line and verdict slot: reserved, filled only by events. */}
        <div className="mt-2 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
          {evidence.ids.length > 0 && (
            <button
              type="button"
              onClick={() => onShowEvidence(strip.claim_id)}
              className="inline-flex min-h-6 cursor-pointer items-center type-meta text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2"
            >
              {evidence.ids.length === 1 ? '1 source' : `${evidence.ids.length} sources`}
              {evidence.disagree > 0 && ` · ${evidence.disagree} disagree`}
              <span className="sr-only"> for part {part}</span>
            </button>
          )}
          {label && (
            <Chip tone={LABEL_TONE[label]} data-label={label}>
              {labelWords(label).charAt(0).toUpperCase() + labelWords(label).slice(1)}
            </Chip>
          )}
        </div>
      </div>

      {/* Margin column (inline under the strip on mobile): the markers' short notes. */}
      <div className={cn('col-start-2 md:col-start-3', notes.length ? 'mt-2 md:mt-0' : 'hidden md:block')}>
        {notes.map((m) => (
          <p key={m.seq} className={cn('line-clamp-3', m.relation === 'contradicts' ? 'text-pencil-red' : 'text-pencil-blue')}>
            <span aria-hidden="true" className="font-note type-note">
              {m.note}
            </span>
            <span className="sr-only">{m.note}</span>
          </p>
        ))}
      </div>
    </li>
  );
}

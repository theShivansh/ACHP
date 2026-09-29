'use client';

import { cn } from 'cn';
import { useLayoutEffect, useRef, useState } from 'react';
import { agentIdentity } from '@/lib/agents.config';
import { measureSpan, type MarkRect } from '@/lib/marks/measure';
import type { ClaimStrip as Strip, Mark as StripMark, StripEvidence } from '@/lib/runs/reducer';
import type { Label } from '@/lib/runs/types';
import { verdictInfo } from '@/lib/verdict';
import { useLinkState, useLinkStore } from './linkStore';
import { Mark, markInk } from './Mark';
import { Stamp } from './Stamp';
import { Tick, VerdictMark } from './VerdictMark';

const MARK_WORDS: Record<StripMark['relation'], string> = {
  contradicts: 'disputes',
  supports: 'backs',
  missing_context: 'says context is missing around',
  framing: 'flags the wording',
  unclear: 'questions',
};

/** A mark in words for screen readers ("Fact Challenger disputes "30 to 40 percent""). */
function markWords(m: StripMark, text: string, label: Label | null): string {
  const who = m.agent ? agentIdentity(m.agent).displayName : 'An agent';
  const quoted = `"${text.slice(m.span[0], m.span[1])}"`;
  if (m.relation === 'contradicts' && label === 'contradicted') return `Struck through as contradicted: ${quoted}`;
  return `${who} ${MARK_WORDS[m.relation]} ${quoted}`;
}

// One checkable part of the message, cut into a strip (S3.4). The text is the part exactly as the
// Decomposer extracted it; marks sit over the characters of their span (S3.5); once the Judge has
// ruled, the part carries the verdict's own mark and a stamp. The row reserves its height for the
// evidence line and the stamp slot, so nothing below moves when they fill.

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
  const [whole, setWhole] = useState<MarkRect[]>([]);
  const store = useLinkStore();
  const link = useLinkState('claim', strip.claim_id);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const node = textRef.current?.firstChild;
    if (!box || !(node instanceof Text)) return;
    const measure = () => {
      setMeasured(strip.marks.map((m) => ({ seq: m.seq, rects: measureSpan(node, m.span, box) })));
      setWhole(measureSpan(node, [0, node.length], box));
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
  }, [strip.marks, strip.text]);

  const notes = strip.marks.filter((m) => m.note);
  // A challenger's finding the Judge hasn't ruled on (yet, or ever: a failed run) is said as such.
  const disputes = label ? [] : strip.marks.filter((m) => m.relation === 'contradicts');
  const disputers = [...new Set(disputes.map((m) => agentIdentity(m.agent ?? '', undefined).displayName))];
  const info = verdictInfo(label);

  const lit = () => store.set({ kind: 'claim', id: strip.claim_id, related: evidence.ids });
  const off = () => store.set(null);

  return (
    <li
      data-claim={strip.claim_id}
      data-link={link}
      onPointerEnter={lit}
      onPointerLeave={off}
      onFocus={lit}
      onBlur={off}
      className={cn(
        'grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 border-t-(length:--rule) border-sheet-line py-6 transition-opacity duration-(--dur-quick) md:grid-cols-[1.5rem_minmax(0,1fr)_120px] animate-[fade-in_var(--dur-base)_var(--ease-out)]',
        link === 'dimmed' && 'opacity-45',
      )}
    >
      <span className="pt-1 type-meta text-ink-3 tabular-nums" aria-hidden="true">
        {part}
      </span>
      <div className="min-w-0">
        <p ref={boxRef} className="relative font-display type-strip text-ink">
          <span className="sr-only">Part {part}: </span>
          <span ref={textRef}>{strip.text}</span>
          {strip.marks.map((m) =>
            (measured.find((x) => x.seq === m.seq)?.rects ?? []).map((rect, i, all) => (
              <Mark
                key={`${m.seq}-${i}`}
                rect={rect}
                relation={m.relation}
                ink={markInk(m.agent, m.relation, label)}
                line={i}
                span={m.span}
                ruled={label === 'contradicted'}
                first={i === 0}
                last={i === all.length - 1}
              />
            )),
          )}
          {label && whole.map((rect, i) => <VerdictMark key={`v-${i}`} rect={rect} label={label} line={i} />)}
        </p>
        {strip.marks.length > 0 && (
          <p className="sr-only">
            {strip.marks.map((m) => markWords(m, strip.text, label)).join('; ')}.
          </p>
        )}

        {/* Evidence line and stamp slot: reserved, filled only by events. */}
        <div className="mt-2 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
          {evidence.ids.length > 0 && (
            <button
              type="button"
              onClick={() => onShowEvidence(strip.claim_id)}
              className="inline-flex min-h-6 cursor-pointer items-center type-meta text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
            >
              {evidence.ids.length === 1 ? '1 source' : `${evidence.ids.length} sources`}
              {evidence.disagree > 0 && ` · ${evidence.disagree} disagree`}
              <span className="sr-only"> for part {part}</span>
            </button>
          )}
          {info && <Stamp label={info.label} id={strip.claim_id} size="strip" />}
        </div>
      </div>

      {/* Margin column (inline under the strip on mobile): ticks, marks' short notes, disputes. */}
      <div
        className={cn(
          'col-start-2 md:col-start-3',
          notes.length || disputers.length || label === 'supported' || label === 'missing_context'
            ? 'mt-2 md:mt-0'
            : 'hidden md:block',
        )}
      >
        {label === 'supported' && <Tick className="mb-1" />}
        {label === 'missing_context' && (
          <p aria-hidden="true" className="type-meta text-ochre">
            ^ context
          </p>
        )}
        {disputers.map((name) => (
          <p key={name} aria-hidden="true" className="type-meta text-pencil-red">
            Disputed by the {name}
          </p>
        ))}
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

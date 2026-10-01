'use client';

import { cn } from 'cn';
import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Ref } from 'react';
import { ClaimMorph } from '@/components/case/ClaimMorph';
import { Button } from '@/components/ui/button';
import { useShake } from '@/lib/useShake';

// The Desk's claim input (07 §2; S2.4, S9.2). A message goes in, and the same words fly into the case's header
// (ClaimMorph) when the run starts. Too short: the field shakes (three cycles of 4px) and the line right under it
// says what is missing; nothing is sent. Submitted: the field is replaced by the claim as a line of the sheet and a
// status sentence, which is both the visible and the spoken confirmation. The parent decides what "submit" does (POST
// /runs, then `openCase`); this component never starts a run itself.

export const MIN_CLAIM = 12;
export const MAX_CLAIM = 4000;

export function ClaimInput({
  onSubmit,
  min = MIN_CLAIM,
  placeholder = 'Paste the message you want checked',
  value: controlled,
  onValueChange,
  textareaRef,
  footer,
  waiting = false,
}: {
  /** Start the check. Resolve when the case is open; throw (with a readable message) if it could not start. */
  onSubmit: (claim: string) => Promise<void>;
  min?: number;
  placeholder?: string;
  /** Controlled text (the Desk's example claims fill the field). Without it the field keeps its own text. */
  value?: string;
  onValueChange?: (value: string) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Extra controls in the sheet's bottom row, before the button (the Library selector). */
  footer?: React.ReactNode;
  /** The backend is still waking: the sent line says the check starts when it is ready. */
  waiting?: boolean;
}) {
  const [own, setOwn] = useState('');
  const value = controlled ?? own;
  const setValue = (v: string) => {
    setOwn(v);
    onValueChange?.(v);
  };
  const [sent, setSent] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldRef, shake, onFieldAnimationEnd] = useShake<HTMLDivElement>();
  const sentRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const helpId = `${id}-help`;
  const problemId = `${id}-problem`;
  const text = value.trim();

  // The form is replaced by the sent line; keep keyboard focus on the page (not on a button that is gone).
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const submit = async () => {
    if (sent) return;
    if (text.length < min) {
      setProblem(`Add a little more, at least ${min} characters, so there is something to check.`);
      shake();
      return;
    }
    if (text.length > MAX_CLAIM) {
      setProblem(`That is too long to check at once. Keep it under ${MAX_CLAIM.toLocaleString('en')} characters.`);
      shake();
      return;
    }
    setProblem(null);
    setSent(text);
    try {
      await onSubmit(text);
    } catch (e) {
      setSent(null);
      setProblem(e instanceof Error ? e.message : 'The check could not start. Try again in a moment.');
    }
  };

  if (sent) {
    return (
      <div
        ref={sentRef}
        tabIndex={-1}
        data-claim-input="sent"
        className="paper rounded-sheet px-5 py-6 shadow-lift-sheet outline-none md:px-8"
      >
        <p className="type-meta font-semibold text-ink-2">The message you were forwarded</p>
        <ClaimMorph>
          <p data-claim-preview className="mt-3 max-w-[68ch] font-display type-claim text-balance text-ink">
            {sent}
          </p>
        </ClaimMorph>
        <p role="status" className="mt-4 type-meta text-ink-2">
          {waiting ? 'Sent to the desk. It is waking up; the check starts as soon as it is ready.' : 'Sent to the desk. Opening the case.'}
        </p>
      </div>
    );
  }

  return (
    <form
      data-claim-input="idle"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-2"
    >
      {/* The focus ring is on the whole sheet (the textarea is borderless), in the paper's pencil blue. */}
      <div
        ref={fieldRef}
        onAnimationEnd={onFieldAnimationEnd}
        className={cn(
          'paper rounded-sheet border-2 px-5 py-4 shadow-lift-sheet focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--focus-ring) md:px-8',
          problem ? 'border-pencil-red' : 'border-transparent',
        )}
      >
        <label htmlFor={id} className="type-meta font-semibold text-ink-2">
          The message you want checked
        </label>
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          rows={4}
          placeholder={placeholder}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${problemId} ${helpId}`}
          onChange={(e) => {
            setValue(e.target.value);
            if (problem) setProblem(null);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          className="mt-2 block min-h-28 w-full resize-y bg-transparent font-display type-claim text-ink placeholder:text-ink-3 focus-visible:outline-none"
        />
      </div>
      {/* Right under the field. The live region is always there, so the words are announced when they arrive;
          an icon and text carry it as well as the border colour. */}
      <p id={problemId} role="alert" className={cn('flex items-start gap-2 type-meta text-desk-red', !problem && 'sr-only')}>
        {problem && <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />}
        {problem}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {footer}
        <Button type="submit" size="lg">
          Check this claim
        </Button>
        <p id={helpId} className="type-meta text-desk-ink-2">
          Ctrl or ⌘ and Enter also check it.
        </p>
      </div>
    </form>
  );
}

'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { LibrarySelect } from '@/components/desk/LibrarySelect';
import { setActiveLibrary, useActiveLibrary } from '@/lib/activeLibrary';
import { useKBList } from '@/lib/api';
import { askLibrary, isOutOfLibrary, orderedCitations, QAError, splitAnswer } from '@/lib/qa';
import type { QAResponse } from '@/lib/qaTypes';
import { QuoteCard } from './QuoteCard';

// Ask a library (07 §6; successor of the paper's Figs. 5–7). The answer is sheet prose; each sentence ends in numbered
// chips for the passages it comes from, and a chip opens its passage. A question the library cannot answer says so
// ("Not in this library.") and shows the nearest passages for what they are, with a way to check the question as a
// claim instead. The server does the grounding: a sentence with no retrieved passage never arrives.

const MIN_QUESTION = 3;

interface Exchange {
  id: number;
  question: string;
  result: QAResponse;
}

/** The answer's prose with its [N] markers turned into numbered chips (1, 2, 3 in order of first citation). */
function Answer({
  result,
  numbers,
  onOpen,
  active,
  cardId,
}: {
  result: QAResponse;
  numbers: Map<number, number>;
  onOpen: (chunk: number) => void;
  active: number | null;
  cardId: (chunk: number) => string;
}) {
  return (
    <p className="max-w-[68ch] font-display type-claim text-ink">
      {splitAnswer(result.answer).map((part, i) =>
        part.kind === 'text' ? (
          <span key={i}>{part.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            data-cite={part.chunk}
            aria-controls={cardId(part.chunk)}
            aria-current={active === part.chunk ? 'true' : undefined}
            aria-label={`Passage ${numbers.get(part.chunk) ?? part.chunk}, chunk ${part.chunk}`}
            onClick={() => onOpen(part.chunk)}
            className={cn(
              'mx-0.5 inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-chip border-(length:--rule) border-sheet-line px-1.5 align-baseline type-meta font-semibold text-pencil-blue hover:bg-surface-tint pointer-coarse:min-h-11 pointer-coarse:min-w-11',
              active === part.chunk && 'border-pencil-blue bg-surface-tint',
            )}
          >
            {numbers.get(part.chunk) ?? part.chunk}
          </button>
        ),
      )}
    </p>
  );
}

function Result({ ex }: { ex: Exchange }) {
  const { result } = ex;
  const out = isOutOfLibrary(result);
  const { cited, other } = orderedCitations(result);
  const numbers = new Map(cited.map((c, i) => [c.chunk_index, i + 1]));
  const [active, setActive] = useState<number | null>(null);
  const base = useId();
  const open = (chunk: number) => {
    setActive(chunk);
    // The card opens in place and takes focus, so the passage is read where the chip was.
    requestAnimationFrame(() => document.getElementById(`${base}-${chunk}`)?.focus());
  };
  return (
    <section data-exchange={ex.id} tabIndex={-1} aria-label={`Question: ${ex.question}`} className="paper rounded-sheet px-5 py-6 shadow-lift-sheet outline-none md:px-8">
      <p className="type-meta font-semibold text-ink-2">You asked</p>
      <h2 className="mt-1 max-w-[68ch] font-display type-claim text-ink">{ex.question}</h2>

      {out ? (
        <div data-out-of-library className="mt-5 border-t-(length:--rule) border-sheet-line pt-4">
          <p className="type-h2 text-ink">Not in this library.</p>
          <p className="mt-1 max-w-[60ch] type-body text-ink-2">
            {result.kb_name} has nothing that answers this. The nearest passages are shown below for what they are: they do not answer it.
          </p>
          <Link
            href={`/?claim=${encodeURIComponent(ex.question)}`}
            className={cn(buttonVariants({ variant: 'secondary' }), 'mt-3')}
          >
            Check it as a claim instead
          </Link>
          {result.citations.length > 0 && (
            <ul aria-label="Nearest passages" className="mt-5 flex flex-col gap-3">
              {[...result.citations].sort((a, b) => b.score - a.score).slice(0, 3).map((c) => (
                <QuoteCard key={c.chunk_index} citation={c} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 border-t-(length:--rule) border-sheet-line pt-4">
            <Answer result={result} numbers={numbers} onOpen={open} active={active} cardId={(c) => `${base}-${c}`} />
            <p className="mt-2 type-meta text-ink-2">From {result.kb_name}. Every sentence comes from the passages below.</p>
          </div>
          <ul aria-label="Passages the answer comes from" className="mt-5 flex flex-col gap-3">
            {cited.map((c) => (
              <QuoteCard key={c.chunk_index} citation={c} number={numbers.get(c.chunk_index)} cardId={`${base}-${c.chunk_index}`} active={active === c.chunk_index} />
            ))}
          </ul>
          {other.length > 0 && (
            <details className="mt-4">
              <summary className="min-h-6 cursor-pointer type-meta text-ink-2 pointer-coarse:min-h-11">
                {other.length === 1 ? '1 other passage was retrieved' : `${other.length} other passages were retrieved`}, not cited
              </summary>
              <ul className="mt-2 flex flex-col gap-3">
                {other.map((c) => (
                  <QuoteCard key={c.chunk_index} citation={c} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function AskPage() {
  const list = useKBList();
  const active = useActiveLibrary();
  const libraries = (list.data?.knowledge_bases ?? []).filter((k) => k.status === 'ready');
  const chosen = libraries.find((k) => k.kb_id === active) ?? null;
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const questionId = useId();
  const next = useRef(1);
  const [ready, setReady] = useState('');

  const submit = async () => {
    const q = question.trim();
    if (busy) return;
    if (!chosen) {
      setProblem('Choose a library to ask first.');
      return;
    }
    if (q.length < MIN_QUESTION) {
      setProblem('Type a question first.');
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const result = await askLibrary(q, chosen.kb_id);
      const id = next.current++;
      setThread((t) => [...t.slice(-9), { id, question: q, result }]);
      setQuestion('');
      setReady(
        isOutOfLibrary(result)
          ? `Not in this library. ${result.citations.length} nearest passages are shown.`
          : `Answer ready, from ${orderedCitations(result).cited.length} passages of ${result.kb_name}.`,
      );
      // The reader's place is the new answer, not the field that was sending.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-exchange="${id}"]`)?.focus());
    } catch (e) {
      setProblem(e instanceof QAError ? e.message : 'The question could not be answered. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[880px] flex-1 px-4 py-8 outline-none md:px-6 md:py-12">
      <h1 className="font-display text-[2rem] leading-tight font-medium text-desk-ink md:text-[2.25rem] [font-variation-settings:'opsz'_48]">Ask a library</h1>
      <p className="mt-2 max-w-[60ch] type-body text-desk-ink-2">
        Questions are answered only from the documents you added. Every sentence of an answer points to the passage it comes from.
      </p>

      {list.isSuccess && libraries.length === 0 ? (
        <div data-empty-libraries className="mt-8 rounded-card border-(length:--rule) border-desk-line px-5 py-6">
          <p className="type-h2 text-desk-ink">No libraries yet.</p>
          <p className="mt-1 max-w-[56ch] type-body text-desk-ink-2">Libraries let ACHP answer from your own documents. Add one, and ask it anything.</p>
          <Link href="/library" className={cn(buttonVariants(), 'mt-4')}>
            Add documents
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <LibrarySelect />
            {chosen && (
              <p data-library-size className="type-meta text-desk-ink-2">
                {chosen.doc_count} {chosen.doc_count === 1 ? 'document' : 'documents'} · {chosen.chunk_count} chunks
              </p>
            )}
            {list.isSuccess && !chosen && libraries.length > 0 && (
              <Button type="button" variant="ghost" size="sm" className="text-desk-ink" onClick={() => setActiveLibrary(libraries[0].kb_id)}>
                Use {libraries[0].name}
              </Button>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-6">
            {thread.map((ex) => (
              <Result key={ex.id} ex={ex} />
            ))}
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="mt-6 flex flex-col gap-2"
          >
            <div className="paper rounded-sheet border-2 border-transparent px-5 py-4 shadow-lift-sheet focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--focus-ring) md:px-8">
              <label htmlFor={questionId} className="type-meta font-semibold text-ink-2">
                {thread.length ? 'Ask a follow-up' : 'Your question'}
              </label>
              <textarea
                id={questionId}
                ref={field}
                rows={2}
                value={question}
                readOnly={busy}
                aria-busy={busy}
                placeholder="How much exercise does WHO recommend per week?"
                aria-describedby={`${questionId}-problem`}
                aria-invalid={problem ? true : undefined}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  if (problem) setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                className="mt-2 block min-h-16 w-full resize-y bg-transparent font-display type-claim text-ink placeholder:text-ink-3 focus-visible:outline-none"
              />
            </div>
            <p id={`${questionId}-problem`} role="alert" className={cn('type-meta text-desk-red', !problem && 'sr-only')}>
              {problem}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button type="submit" size="lg" disabled={busy}>
                Ask
              </Button>
              <p role="status" className="type-meta text-desk-ink-2">
                {busy ? 'Reading the library…' : ready || 'Enter asks. Shift and Enter adds a line.'}
              </p>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

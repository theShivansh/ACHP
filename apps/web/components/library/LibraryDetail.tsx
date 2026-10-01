'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { setActiveLibrary } from '@/lib/activeLibrary';
import { useKB, useKBChunks } from '@/lib/api';
import { formatBytes } from '@/lib/format';

// One library (07 §7): what it is, then its chunks as a stacked list with a search box, so the reader can see exactly
// what a question or a check can quote. The chunk text is stored text, shown verbatim.

const PREVIEW = 200;

export function LibraryDetail({ kbId }: { kbId: string }) {
  const kb = useKB(kbId);
  const ready = kb.data?.status === 'ready';
  const chunks = useKBChunks(kbId, !!kb.data && kb.data.status !== 'indexing');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => (chunks.data?.chunks ?? []).filter((c) => !needle || c.text.toLowerCase().includes(needle)),
    [chunks.data, needle],
  );

  if (kb.isError) {
    const gone = kb.error?.message === 'not_found';
    return (
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[880px] flex-1 px-4 py-12 outline-none md:px-6">
        <h1 className="font-display text-[2rem] font-medium text-desk-ink">{gone ? 'That library is not here.' : 'The library could not be loaded.'}</h1>
        <p className="mt-2 type-body text-desk-ink-2">{gone ? 'It may have been deleted.' : 'The desk may still be waking. Try again in a moment.'}</p>
        <Link href="/library" className={cn(buttonVariants(), 'mt-4')}>
          Back to libraries
        </Link>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[880px] flex-1 px-4 py-8 outline-none md:px-6 md:py-12">
      <p className="type-meta text-desk-ink-2">
        <Link href="/library" className="underline decoration-(length:--rule) underline-offset-4">
          Libraries
        </Link>
      </p>
      <h1 className="mt-1 font-display text-[2rem] leading-tight font-medium break-words text-desk-ink md:text-[2.25rem] [font-variation-settings:'opsz'_48]">
        {kb.data?.name ?? 'Loading the library'}
      </h1>
      {kb.data && (
        <>
          <p data-kb-facts className="mt-2 type-body text-desk-ink-2">
            {kb.data.doc_count} {kb.data.doc_count === 1 ? 'document' : 'documents'} · {kb.data.chunk_count} chunks · {formatBytes(kb.data.size_bytes)}
            {' · '}
            {kb.data.status === 'ready' ? 'Ready' : kb.data.status === 'indexing' ? 'Indexing' : 'Could not be indexed'}
          </p>
          <p className="mt-1 type-meta text-desk-ink-2">
            From {kb.data.source_type === 'file' ? 'the file' : kb.data.source_type === 'url' ? 'the web address' : 'pasted text'} “{kb.data.source_name}”.
          </p>
          {ready && (
            <Link href="/ask" onClick={() => setActiveLibrary(kbId)} className={cn(buttonVariants({ size: 'lg' }), 'mt-4')}>
              Ask this library
            </Link>
          )}
        </>
      )}

      {kb.data?.status === 'indexing' && (
        <p role="status" className="mt-6 type-body text-desk-ink-2">
          This library is being indexed. Its chunks appear here when it is ready; the page checks by itself.
        </p>
      )}

      {kb.data && kb.data.status !== 'indexing' && (
        <section aria-labelledby="chunks-title" className="mt-8">
          <h2 id="chunks-title" className="type-h2 text-desk-ink">
            Chunks
          </h2>
          <div className="mt-3">
            <label htmlFor="chunk-search" className="type-meta text-desk-ink-2">
              Search the chunks
            </label>
            <input
              id="chunk-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 block min-h-10 w-full max-w-md rounded-button border-(length:--rule) border-desk-ink-2 bg-desk-raised px-3 type-ui text-desk-ink pointer-coarse:min-h-11"
            />
          </div>
          <p role="status" className="mt-2 type-meta text-desk-ink-2">
            {chunks.isLoading ? 'Loading the chunks…' : chunks.isError ? '' : needle ? `${shown.length} of ${chunks.data?.chunks.length ?? 0} chunks match.` : `${shown.length} chunks.`}
          </p>
          {chunks.isError && (
            <p role="alert" className="type-body text-desk-red">
              The chunks could not be loaded.
            </p>
          )}
          <ol className="mt-3 flex flex-col gap-3">
            {shown.map((c) => {
              const isOpen = open.has(c.index);
              const long = c.text.length > PREVIEW;
              return (
                <li key={c.index} data-chunk={c.index} className="paper rounded-card border-(length:--rule) border-sheet-line px-4 py-3 shadow-lift-card">
                  <p className="type-meta text-ink-2">
                    <span className="font-semibold text-ink">Chunk {c.index}</span> · {c.char_count.toLocaleString('en')} characters
                  </p>
                  <p className="mt-1 max-w-[68ch] font-display type-body text-ink">{isOpen || !long ? c.text : `${c.text.slice(0, PREVIEW).trimEnd()}…`}</p>
                  {long && (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(c.index)) n.delete(c.index);
                          else n.add(c.index);
                          return n;
                        })
                      }
                      className="mt-1 min-h-6 cursor-pointer type-meta text-pencil-blue underline decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11"
                    >
                      {isOpen ? 'Show less' : 'Read the whole chunk'}
                      <span className="sr-only"> {c.index}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </main>
  );
}

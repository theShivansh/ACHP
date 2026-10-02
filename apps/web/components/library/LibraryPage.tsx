'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { setActiveLibrary, useActiveLibrary } from '@/lib/activeLibrary';
import { useKBDelete, useKBList, useKBUpload, type KBItem } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { fileProblem, KB_FILE_TYPES, textProblem, urlProblem } from '@/lib/kbLimits';

// Libraries (07 §7; successor of the paper's Fig. 2): the reader's own documents, which checks and questions can use.
// Index cards with a real status (the list polls while anything is indexing), a drop zone for a file, a URL or pasted
// text, and a confirmation dialog before anything is deleted (never a browser confirm()). No progress bar is drawn:
// the server reports Ready, Indexing or Error, and that is what is shown.

const STATUS_WORDS: Record<KBItem['status'], string> = {
  ready: 'Ready',
  indexing: 'Indexing',
  error: 'Could not be indexed',
};

function IndexCard({ kb, active, onDelete }: { kb: KBItem; active: boolean; onDelete: (kb: KBItem) => void }) {
  return (
    <li data-kb={kb.kb_id} className="paper flex flex-col rounded-card border-(length:--rule) border-sheet-line px-4 py-4 shadow-lift-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-display type-strip font-medium break-words text-ink">{kb.name}</h2>
        {active && (
          <span data-active-chip className="shrink-0 rounded-chip border-(length:--rule) border-ink px-2 py-0.5 type-meta text-ink">
            Active
          </span>
        )}
      </div>
      <p className="mt-1 type-meta text-ink-2">
        {kb.doc_count} {kb.doc_count === 1 ? 'doc' : 'docs'} · {kb.chunk_count} chunks · {formatBytes(kb.size_bytes)}
      </p>
      <p
        data-kb-status={kb.status}
        className={cn('mt-1 type-meta', kb.status === 'error' ? 'text-pencil-red' : kb.status === 'indexing' ? 'text-ochre' : 'text-ink')}
      >
        {STATUS_WORDS[kb.status]}
        {kb.status === 'indexing' && <span className="text-ink-2"> · checking every few seconds</span>}
        {kb.status === 'error' && <span className="text-ink-2"> · delete it and add the document again</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/library/${encodeURIComponent(kb.kb_id)}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Open<span className="sr-only"> {kb.name}</span>
        </Link>
        {kb.status === 'ready' && (
          <>
            <Link
              href="/ask"
              onClick={() => setActiveLibrary(kb.kb_id)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Ask<span className="sr-only"> {kb.name}</span>
            </Link>
            {!active && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setActiveLibrary(kb.kb_id)}>
                Set active<span className="sr-only">: {kb.name}</span>
              </Button>
            )}
          </>
        )}
        <Button type="button" variant="ghost" size="sm" className="text-surface-red hover:text-surface-red" onClick={() => onDelete(kb)}>
          Delete<span className="sr-only"> {kb.name}</span>
        </Button>
      </div>
    </li>
  );
}

function DropZone() {
  const upload = useKBUpload();
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const send = (payload: Parameters<typeof upload.mutate>[0], clear?: () => void) => {
    setProblem('');
    setNote('');
    // The backend's limits, checked here first so the reader hears what is wrong without a round trip.
    const local = 'file' in payload && payload.file ? fileProblem(payload.file) : 'url' in payload && payload.url ? urlProblem(payload.url) : 'text' in payload && payload.text != null ? textProblem(payload.text) : null;
    if (local) {
      setProblem(local);
      return;
    }
    upload.mutate(payload, {
      onSuccess: (r) => {
        setNote(`Added “${r.name}”: ${r.chunk_count} chunks. ${r.status === 'ready' ? 'It is ready.' : 'It is being indexed.'}`);
        clear?.();
      },
      onError: (e) => setProblem(e.message || 'The upload failed. Try again.'),
    });
  };

  return (
    <li
      data-dropzone
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) send({ file: f, name: name || undefined });
      }}
      className={cn(
        'flex flex-col rounded-card border-(length:--rule) border-dashed px-4 py-4',
        over ? 'border-desk-ink bg-desk-raised' : 'border-desk-line',
      )}
    >
      <h2 id="add-docs" className="type-ui font-semibold text-desk-ink">
        Add documents
      </h2>
      <p className="mt-1 type-meta text-desk-ink-2">Drop a PDF, Word or text file of up to 50 MB here, or choose one.</p>
      <input
        ref={file}
        type="file"
        accept={KB_FILE_TYPES.join(',')}
        hidden
        data-file-input
        aria-label="Choose a document to add"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) send({ file: f, name: name || undefined });
          e.target.value = '';
        }}
      />
      <Button type="button" variant="secondary" size="sm" className="mt-2 w-fit text-desk-ink" onClick={() => file.current?.click()} disabled={upload.isPending}>
        Choose a file
      </Button>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) send({ url: url.trim(), name: name || undefined }, () => setUrl(''));
        }}
      >
        <label htmlFor="kb-url" className="type-meta text-desk-ink-2">
          Or paste a web address
        </label>
        <div className="flex gap-2">
          <input
            id="kb-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            aria-describedby={problem ? 'kb-problem' : undefined}
            className="min-h-10 min-w-0 flex-1 rounded-button border-(length:--rule) border-desk-ink-2 bg-desk-raised px-3 type-ui text-desk-ink placeholder:text-desk-ink-2 pointer-coarse:min-h-11"
          />
          <Button type="submit" variant="secondary" className="text-desk-ink" disabled={upload.isPending || !url.trim()}>
            Add
          </Button>
        </div>
      </form>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ text: text.trim(), name: name || undefined }, () => setText(''));
        }}
      >
        <label htmlFor="kb-text" className="type-meta text-desk-ink-2">
          Or paste text
        </label>
        <textarea
          id="kb-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={problem ? 'kb-problem' : undefined}
          className="rounded-button border-(length:--rule) border-desk-ink-2 bg-desk-raised px-3 py-2 type-ui text-desk-ink placeholder:text-desk-ink-2"
        />
        <label htmlFor="kb-name" className="type-meta text-desk-ink-2">
          Name it (optional)
        </label>
        <input
          id="kb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-10 rounded-button border-(length:--rule) border-desk-ink-2 bg-desk-raised px-3 type-ui text-desk-ink pointer-coarse:min-h-11"
        />
        <Button type="submit" variant="secondary" className="w-fit text-desk-ink" disabled={upload.isPending || !text.trim()}>
          Add text
        </Button>
      </form>

      <p role="status" className="mt-3 type-meta text-desk-ink-2">
        {upload.isPending ? 'Uploading…' : note}
      </p>
      <p id="kb-problem" role="alert" className={cn('type-meta text-desk-red', !problem && 'sr-only')}>
        {problem}
      </p>
    </li>
  );
}

export function LibraryPage() {
  const list = useKBList();
  const del = useKBDelete();
  const active = useActiveLibrary();
  const [target, setTarget] = useState<KBItem | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const doneRef = useRef<HTMLParagraphElement>(null);
  // The Delete button that opened the dialog: Cancel or Escape gives focus back to it (WCAG 2.4.3).
  const opener = useRef<HTMLElement | null>(null);
  const deleted = useRef(false);
  const askDelete = (kb: KBItem) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    deleted.current = false;
    setTarget(kb);
  };
  const items = list.data?.knowledge_bases ?? [];

  const confirmDelete = () => {
    if (!target) return;
    const kb = target;
    setError('');
    del.mutate(kb.kb_id, {
      onSuccess: () => {
        if (active === kb.kb_id) setActiveLibrary(null);
        setDone(`Deleted “${kb.name}”.`);
        // The card (and the button the dialog would return to) is gone: focus lands on the confirmation instead.
        deleted.current = true;
        setTarget(null);
      },
      onError: (e) => setError(e.message || 'It could not be deleted. Try again.'),
    });
  };

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 outline-none md:px-6 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2rem] leading-tight font-medium text-desk-ink md:text-[2.25rem] [font-variation-settings:'opsz'_48]">Libraries</h1>
          <p className="mt-2 max-w-[60ch] type-body text-desk-ink-2">
            Libraries let ACHP check claims against your own documents, and answer questions from them.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            const zone = document.querySelector<HTMLElement>('[data-dropzone]');
            zone?.scrollIntoView({ block: 'center' });
            document.getElementById('add-docs')?.focus?.();
            zone?.querySelector<HTMLButtonElement>('button')?.focus();
          }}
        >
          Add documents
        </Button>
      </div>

      <p role="status" ref={doneRef} tabIndex={-1} className="mt-4 type-meta text-desk-ink-2 outline-none">
        {done}
      </p>
      {list.isError && (
        <p role="alert" className="mt-4 type-body text-desk-red">
          The libraries could not be loaded. The desk may still be waking; this page tries again by itself.
        </p>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((kb) => (
          <IndexCard key={kb.kb_id} kb={kb} active={kb.kb_id === active} onDelete={askDelete} />
        ))}
        <DropZone />
      </ul>
      {list.isSuccess && items.length === 0 && (
        <p data-empty-libraries className="mt-6 max-w-[60ch] type-body text-desk-ink-2">
          Libraries let ACHP check claims against your own documents. Add the first one on the right.
        </p>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && !del.isPending && setTarget(null)}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (deleted.current) doneRef.current?.focus();
            else opener.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete “{target?.name}”?</DialogTitle>
            <DialogDescription>
              This removes its {target?.chunk_count} chunks. Checks you already ran are not changed. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p role="alert" className={cn('type-meta text-surface-red', !error && 'sr-only')}>
            {error}
          </p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setTarget(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={del.isPending}>
              {del.isPending ? 'Deleting…' : 'Delete library'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

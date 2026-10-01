'use client';

import { useQueries } from '@tanstack/react-query';
import { cn } from 'cn';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Hallmark } from '@/components/assay/Hallmark';
import { Stamp } from '@/components/case/Stamp';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { twoKeyCopy } from '@/lib/assay/present';
import { timeAgo } from '@/lib/format';
import { fetchEvents, RunRequestError } from '@/lib/runs/api';
import { forgetRun, useHistory, type HistoryEntry } from '@/lib/runs/history';
import { plotted, summarize, type RunSummary } from '@/lib/runs/runSummary';
import { excerpt } from '@/lib/verdict';
import { IntegrityMap } from './IntegrityMap';

// This browser's checks (07 §5): a list (stamp · 24px Hallmark · the claim · when · the Two-Key state) and the Integrity
// Map. Only ids are stored here; each row is read from the run's own stored log, so a row can never disagree with its
// case. A blocked message has a stamp and no scores. Empty: three recorded samples, labelled as samples.

const TWO_KEY_SHORT = { agree: 'Judge and formula agree', adjacent: 'Close call', split: 'Split decision' } as const;

export interface SampleRow {
  id: string;
  summary: RunSummary;
}

type Row = { entry: HistoryEntry; summary: RunSummary | null; gone: boolean; loading: boolean };

function RunRow({ row, focused, onFocus, onForget }: { row: Row; focused: boolean; onFocus: (id: string | null) => void; onForget?: (id: string) => void }) {
  const s = row.summary;
  const tk = s?.assay ? twoKeyCopy(s.assay.two_key, s.assay.composite) : null;
  const id = row.entry.id;
  return (
    <li
      data-run={id}
      onPointerEnter={() => onFocus(id)}
      onPointerLeave={() => onFocus(null)}
      className={cn('grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 border-b-(length:--rule) border-desk-line py-4 md:grid-cols-[minmax(0,1fr)_auto_auto]', focused && 'bg-desk-raised')}
    >
      {s ? (
        <>
          <div className="min-w-0">
            <Link href={`/case/${id}`} className="font-display text-[1.125rem] leading-snug text-desk-ink underline decoration-(length:--rule) underline-offset-4">
              {excerpt(s.claim, 140)}
            </Link>
            <p className="mt-1 type-meta text-desk-ink-2">
              {s.status === 'running' ? 'Still checking' : s.status === 'failed' ? 'Stopped, no verdict' : null}
              {s.status !== 'completed' && ' · '}
              {s.startedAt ? timeAgo(s.startedAt) : 'time not recorded'}
              {tk && TWO_KEY_SHORT[tk.state as keyof typeof TWO_KEY_SHORT] && ` · ${TWO_KEY_SHORT[tk.state as keyof typeof TWO_KEY_SHORT]}`}
            </p>
          </div>
          <div className="flex items-center gap-3 md:justify-self-end">
            {s.label ? <Stamp label={s.label} id={id} size="strip" /> : <span className="type-meta text-desk-ink-2">No verdict</span>}
          </div>
          <div className="col-span-2 flex items-center gap-3 md:col-span-1 md:justify-self-end">
            {s.assay ? <span className="paper inline-flex rounded-card px-2 py-1"><Hallmark metrics={s.assay.metrics} size={24} /></span> : <span className="type-meta text-desk-ink-2">{s.label === 'blocked' ? 'Not scored' : 'No scores'}</span>}
            {onForget && (
              <Button type="button" variant="ghost" size="sm" className="text-desk-ink-2" onClick={() => onForget(id)}>
                Remove<span className="sr-only"> from this list: {excerpt(s.claim, 40)}</span>
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="type-body text-desk-ink-2">
            {row.loading ? 'Loading a check…' : row.gone ? 'A check that is no longer stored.' : 'A check that could not be loaded right now.'} <span className="type-meta">({id})</span>
          </p>
          {onForget && (
            <Button type="button" variant="ghost" size="sm" className="text-desk-ink-2" onClick={() => onForget(id)}>
              Remove<span className="sr-only"> {id} from this list</span>
            </Button>
          )}
        </>
      )}
    </li>
  );
}

export function RunsPage({ samples }: { samples: SampleRow[] }) {
  const history = useHistory();
  const [tab, setTab] = useState('list');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [removed, setRemoved] = useState('');
  const removedRef = useRef<HTMLParagraphElement>(null);

  const results = useQueries({
    queries: (history ?? []).map((e) => ({
      queryKey: ['run-summary', e.id],
      queryFn: async () => summarize(e.id, await fetchEvents(e.id)),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const rows: Row[] = (history ?? []).map((entry, i) => {
    const r = results[i];
    return {
      entry,
      summary: r?.data ?? null,
      gone: r?.error instanceof RunRequestError && r.error.status === 404,
      loading: !r || r.isLoading,
    };
  });
  const forget = (id: string) => {
    void forgetRun(id);
    setRemoved('Removed from this list.');
    // The row with the focused button is gone: focus lands on the confirmation.
    requestAnimationFrame(() => removedRef.current?.focus());
  };
  const scored = plotted(rows.flatMap((r) => (r.summary ? [r.summary] : [])));
  const empty = history !== null && history.length === 0;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8 outline-none md:px-6 md:py-12">
      <h1 className="font-display text-[2rem] leading-tight font-medium text-desk-ink md:text-[2.25rem] [font-variation-settings:'opsz'_48]">
        Your checks (this browser)
      </h1>
      <p className="mt-2 max-w-[60ch] type-body text-desk-ink-2">
        The checks you opened on this device. Nothing is shared: the list lives in this browser, and each row is read from the check itself.
      </p>

      <p role="status" ref={removedRef} tabIndex={-1} className="mt-2 type-meta text-desk-ink-2 outline-none">
        {removed}
      </p>

      {history === null ? (
        <p role="status" className="mt-8 type-body text-desk-ink-2">
          Loading your checks…
        </p>
      ) : empty ? (
        <div data-empty-runs className="mt-8">
          <p className="type-h2 text-desk-ink">No checks yet on this browser.</p>
          <p className="mt-1 max-w-[56ch] type-body text-desk-ink-2">Check a message and it will be listed here. Meanwhile, here are three recorded examples.</p>
          <Link href="/" className={cn(buttonVariants(), 'mt-4')}>
            Check a message
          </Link>
          <ul aria-label="Sample checks" className="mt-6">
            {samples.map((s) => (
              <li key={s.id} data-sample={s.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b-(length:--rule) border-desk-line py-4">
                <div className="min-w-0">
                  <Link href={`/case/${s.id}`} className="font-display text-[1.125rem] leading-snug text-desk-ink underline decoration-(length:--rule) underline-offset-4">
                    {excerpt(s.summary.claim, 140)}
                  </Link>
                  <p className="mt-1 type-meta text-desk-ink-2">Sample, a recorded check</p>
                </div>
                {s.summary.label && <Stamp label={s.summary.label} id={s.id} size="strip" />}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList aria-label="How to see your checks">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4">
            <p data-hallmark-key className="mb-2 max-w-[68ch] type-meta text-desk-ink-2">
              The five marks on each row, left to right: Consensus Truth Score, Perspective Completeness Score, Bias Impact Score (hatched; lower is better), Narrative Stance Score and Epistemic Position
              Score. Point at a mark for its name and value.
            </p>
            <ul data-runs-list>
              {rows.map((r) => (
                <RunRow key={r.entry.id} row={r} focused={focusId === r.entry.id} onFocus={setFocusId} onForget={forget} />
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="map" className="mt-4">
            {scored.length > 0 ? (
              <IntegrityMap rows={scored} focusId={focusId} onFocus={setFocusId} />
            ) : (
              <p data-map-empty className="type-body text-desk-ink-2">
                None of your checks has scores to place on the map yet. A check is scored by the Assay once it completes.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

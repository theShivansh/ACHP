'use client';

import { cn } from 'cn';
import { ChevronRight, Download } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { agentIdentity } from '@/lib/agents.config';
import { fetchEventsJsonText } from '@/lib/runs/api';
import type { RunState } from '@/lib/runs/reducer';
import { eventSummary } from '@/lib/runs/summary';

// The Trace tab (07 §4.2): the raw events, one row each, virtualized. Mono is allowed here, for
// event ids and the JSON of an expanded row. "Download events.json" saves the server's own file
// verbatim. Rows are windowed with known heights, so a long run stays cheap.

const ROW = 40;
const DETAIL = 240;
const VIEW = 520;
const OVERSCAN = 6;

export function TraceTable({ state, runId, baseUrl }: { state: RunState; runId: string; baseUrl: string }) {
  const events = state.events;
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const { offsets, total } = useMemo(() => {
    const offs: number[] = [];
    let y = 0;
    for (const e of events) {
      offs.push(y);
      y += ROW + (open.has(e.seq) ? DETAIL : 0);
    }
    return { offsets: offs, total: y };
  }, [events, open]);

  // First row whose bottom is below the window's top, and the rows through the window's bottom.
  let start = 0;
  while (start < events.length - 1 && offsets[start + 1] <= scrollTop) start += 1;
  let end = start;
  while (end < events.length - 1 && offsets[end + 1] < scrollTop + VIEW) end += 1;
  start = Math.max(0, start - OVERSCAN);
  end = Math.min(events.length - 1, end + OVERSCAN);
  const topPad = events.length ? offsets[start] : 0;
  const bottomPad = events.length ? total - (offsets[end] + ROW + (open.has(events[end].seq) ? DETAIL : 0)) : 0;

  const toggle = (seq: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });

  async function download() {
    setError(null);
    try {
      const text = await fetchEventsJsonText(runId, baseUrl);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${runId}-events.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('The event file could not be downloaded. Try again in a moment.');
    }
  }

  return (
    <section aria-labelledby="trace-title" data-trace>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="trace-title" className="type-h2 text-ink">
          Trace
        </h2>
        <p data-event-count={events.length} className="type-meta text-ink-2 tabular-nums">
          {events.length} events
        </p>
      </header>
      <p className="mt-1 max-w-[68ch] type-meta text-ink-2">
        Everything the agents did, in order, exactly as the server logged it. Nothing on this page is shown that is not here.
      </p>
      <Button className="mt-3" variant="secondary" onClick={download}>
        <Download aria-hidden="true" />
        Download events.json
      </Button>
      {error && (
        <p role="alert" className="mt-2 type-meta text-pencil-red">
          {error}
        </p>
      )}

      <div
        ref={box}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        tabIndex={0}
        role="region"
        aria-label="Event log"
        className="mt-4 max-h-[520px] overflow-auto border-y-(length:--rule) border-sheet-line"
      >
        <table aria-rowcount={events.length + 1} className="w-full min-w-[640px] table-fixed border-collapse text-left">
          <caption className="sr-only">Events in the order they happened</caption>
          <colgroup>
            <col className="w-24" />
            <col className="w-40" />
            <col className="w-44" />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-sheet">
            <tr className="border-b-(length:--rule) border-sheet-line">
              <th scope="col" aria-rowindex={1} className="py-2 pr-3 type-meta font-semibold text-ink-2">
                Time
              </th>
              <th scope="col" className="py-2 pr-3 type-meta font-semibold text-ink-2">
                Agent
              </th>
              <th scope="col" className="py-2 pr-3 type-meta font-semibold text-ink-2">
                Event
              </th>
              <th scope="col" className="py-2 type-meta font-semibold text-ink-2">
                What happened
              </th>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr aria-hidden="true" className="h-(--pad)" style={{ '--pad': `${topPad}px` } as React.CSSProperties}>
                <td colSpan={4} />
              </tr>
            )}
            {events.slice(start, end + 1).flatMap((e) => {
              const expanded = open.has(e.seq);
              const who = e.agent ? agentIdentity(e.agent, state.lanes[e.agent]?.name).displayName : 'Run';
              return [
                <tr
                  key={e.seq}
                  data-seq={e.seq}
                  aria-rowindex={e.seq + 1}
                  className="h-10 border-b-(length:--rule) border-sheet-line align-middle"
                >
                  <td className="pr-3 type-meta text-ink-2 tabular-nums">{(e.t_ms / 1000).toFixed(2)}s</td>
                  <td className="truncate pr-3 type-meta text-ink">{who}</td>
                  <td className="pr-3">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`trace-json-${e.seq}`}
                      onClick={() => toggle(e.seq)}
                      className="inline-flex min-h-6 max-w-full cursor-pointer items-center gap-1 font-code text-[0.8125rem] text-ink underline-offset-4 hover:underline pointer-coarse:min-h-11"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn('size-3.5 shrink-0 stroke-[1.5] transition-transform duration-(--dur-quick)', expanded && 'rotate-90')}
                      />
                      <span className="truncate">{e.type}</span>
                      <span className="sr-only"> ({expanded ? 'hide' : 'show'} the raw event)</span>
                    </button>
                  </td>
                  <td className="truncate type-meta text-ink-2">{eventSummary(e)}</td>
                </tr>,
                expanded && (
                  <tr key={`${e.seq}-json`} className="h-60 align-top">
                    <td colSpan={4} className="py-2">
                      <pre
                        id={`trace-json-${e.seq}`}
                        role="region"
                        aria-label={`Event ${e.seq} as JSON`}
                        tabIndex={0}
                        className="h-56 overflow-auto rounded-card bg-surface-tint p-3 font-code text-[0.8125rem] leading-snug whitespace-pre-wrap text-ink"
                      >
                        {JSON.stringify(e, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ),
              ];
            })}
            {bottomPad > 0 && (
              <tr aria-hidden="true" className="h-(--pad)" style={{ '--pad': `${bottomPad}px` } as React.CSSProperties}>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

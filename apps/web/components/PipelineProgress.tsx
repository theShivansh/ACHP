'use client';

// Live run status for the legacy page, projected from the run's event log (lib/runs). Every line
// here is an event the server sent: lanes from run.started, states from agent.*, the action line
// from agent.action, the summary from agent.done. No percentage, no timer, no estimate.
// P3 replaces this with the investigation board.

import type { ConnectionStatus } from '@/lib/runs/connection';
import { laneCounts, lanes, type Lane, type RunState } from '@/lib/runs/reducer';
import { cn } from '@/lib/utils';

const STATE_WORDS: Record<Lane['state'], string> = {
  queued: 'Waiting',
  working: 'Working',
  waiting: 'Second round',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
};

const SKIP_WORDS: Record<string, string> = {
  blocked: 'Not needed: the message was not checked',
  cache_hit: 'Answer came from a recent check',
  not_applicable: 'Not needed for this message',
};

function seconds(ms: number | null): string {
  return ms === null ? '' : ` · ${(ms / 1000).toFixed(1)}s`;
}

function lineFor(lane: Lane): string {
  if (lane.state === 'failed') return lane.error?.message ?? 'Could not finish.';
  if (lane.state === 'skipped') return SKIP_WORDS[lane.skipReason ?? ''] ?? (lane.skipReason ?? '').replace(/_/g, ' ');
  if (lane.state === 'done') return lane.summary ?? '';
  return lane.action ? lane.action.label : '';
}

interface PipelineProgressProps {
  run: RunState;
  connection: ConnectionStatus;
  onRetry: () => void;
}

export default function PipelineProgress({ run, connection, onRetry }: PipelineProgressProps) {
  const all = lanes(run);
  const counts = laneCounts(run);
  const finished = counts.done + counts.skipped + counts.failed;

  let headline = 'Starting the check…';
  if (run.status === 'queued' && run.queuePosition) {
    const ahead = run.queuePosition - 1;
    headline = ahead > 0 ? `Waiting for a free desk · ${ahead} ahead` : 'Waiting for a free desk · next in line';
  } else if (run.status === 'running') {
    headline = `Checking · ${finished} of ${all.length} agents finished`;
  } else if (run.status === 'completed') {
    headline = 'Check complete';
  } else if (run.status === 'failed') {
    headline = 'The check stopped. No verdict was produced.';
  }

  return (
    <section
      aria-label="Live progress"
      className="rounded-md border border-desk-line bg-desk-raised p-4 text-desk-ink"
      data-run-status={run.status}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{headline}</p>
        {connection === 'reconnecting' && (
          <p className="text-xs text-desk-ink-2" role="status">
            Reconnecting to the live log…
          </p>
        )}
        {connection === 'interrupted' && (
          <p className="flex items-center gap-2 text-xs text-desk-ink-2" role="status">
            Live updates stopped.
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-md border border-desk-line px-3 text-desk-ink hover:bg-desk focus-visible:outline-2"
            >
              Retry
            </button>
          </p>
        )}
      </div>

      {all.length > 0 && (
        <ol className="mt-3 grid gap-1.5">
          {all.map((lane) => (
            <li
              key={lane.id}
              data-lane={lane.id}
              data-state={lane.state}
              className={cn(
                'grid grid-cols-[9rem_7.5rem_1fr] items-baseline gap-3 text-sm max-sm:grid-cols-[1fr_auto]',
                (lane.state === 'queued' || lane.state === 'skipped') && 'text-desk-ink-2',
              )}
            >
              <span className="font-medium">{lane.name}</span>
              <span className={cn('text-xs', lane.state === 'failed' && 'text-desk-red')}>
                {STATE_WORDS[lane.state]}
                {lane.state === 'done' ? seconds(lane.durationMs) : ''}
                {lane.round > 1 && lane.state !== 'waiting' ? ' · round 2' : ''}
              </span>
              <span className="text-xs text-desk-ink-2 max-sm:col-span-2">{lineFor(lane)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

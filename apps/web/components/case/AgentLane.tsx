'use client';

import { cn } from 'cn';
import { useState } from 'react';
import { Roll } from '@/components/ui/roll';
import { agentIdentity, deskInkClass } from '@/lib/agents.config';
import { skipWords } from '@/lib/runs/announcer';
import type { Lane, LaneGroup } from '@/lib/runs/reducer';
import { Elapsed, formatSeconds } from './Elapsed';

// One agent's lane on the desk (04 §7, 06 §4.1). Everything shown comes from the lane slice the
// reducer built from events: state, the latest action, the latest public note, durations.

export interface LaneClock {
  lastTMs: number;
  receivedAt: number | null;
  rate: number;
}

function chipText(lane: Lane): string | null {
  switch (lane.state) {
    case 'queued':
      return 'Waiting';
    case 'working':
      return null; // "Working · 3.2s" is rendered live
    case 'waiting':
      return 'Second round';
    case 'done':
      return null; // "Done · 3.2s" is rendered with its number (settles with a roll when the lane finishes)
    case 'skipped':
      return 'Skipped';
    case 'failed':
      return 'Failed';
  }
}

function actionLine(lane: Lane, debateReason: string | null): string | null {
  switch (lane.state) {
    case 'working':
      return lane.action ? (lane.action.detail ? `${lane.action.label}: ${lane.action.detail}` : lane.action.label) : null;
    case 'waiting':
      return debateReason;
    case 'done':
      return lane.summary;
    case 'skipped':
      return lane.skipReason ? capitalise(skipWords(lane.skipReason)) : null;
    case 'failed':
      return lane.error?.message ?? null;
    default:
      return null;
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AgentLane({
  lane,
  clock,
  debateReason,
}: {
  lane: Lane;
  clock: LaneClock;
  debateReason: string | null;
}) {
  const identity = agentIdentity(lane.id, lane.name);
  const Glyph = identity.glyph;
  // A template note restates counts the lane's own summary already gives once it's done, so a
  // finished lane shows only notes the model wrote (validated server-side, 06 §5).
  const latest = lane.notes[lane.notes.length - 1] ?? null;
  const note = latest && (lane.state !== 'done' || latest.source === 'model') ? latest : null;
  const line = actionLine(lane, debateReason);
  const chip = chipText(lane);
  const actionKey = lane.state === 'working' ? `${lane.action?.kind}:${lane.action?.label}` : lane.state;
  // The line crossfades when it changes while you watch (a new action; working → done); a lane that opens
  // already in its state, such as a stored case, is simply there. The duration rolls only when a lane finishes live.
  const [firstKey] = useState(actionKey);
  const [seenState, setSeenState] = useState(lane.state);
  const [finishedLive, setFinishedLive] = useState(false);
  if (lane.state !== seenState) {
    setSeenState(lane.state);
    setFinishedLive(seenState === 'working' && lane.state === 'done');
  }

  return (
    <li
      data-agent={lane.id}
      data-state={lane.state}
      className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 py-3"
    >
      <span
        className={cn(
          'relative mt-px inline-flex size-6 items-center justify-center',
          deskInkClass[identity.ink],
          lane.state === 'queued' && 'opacity-50',
          lane.state === 'skipped' && 'opacity-40',
        )}
      >
        <Glyph className={cn(lane.state === 'working' && 'boil')} />
        {lane.state === 'failed' && (
          <span
            aria-hidden="true"
            className="absolute -inset-1 rounded-full border-(length:--rule) border-dashed border-desk-red"
          />
        )}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 type-ui font-semibold text-desk-ink">{identity.displayName}</h3>
          <span
            className={cn(
              'shrink-0 type-meta whitespace-nowrap',
              lane.state === 'failed' ? 'text-desk-red' : 'text-desk-ink-2',
            )}
          >
            {lane.state === 'done' && lane.durationMs != null ? (
              <>
                Done · <Roll value={formatSeconds(lane.durationMs)} onMount={finishedLive} />
              </>
            ) : lane.state === 'done' ? (
              'Done'
            ) : (
              chip ?? (
              <>
                Working ·{' '}
                <Elapsed
                  startedAtMs={lane.startedAtMs ?? clock.lastTMs}
                  lastTMs={clock.lastTMs}
                  receivedAt={clock.receivedAt}
                  rate={clock.rate}
                />
              </>
              )
            )}
          </span>
        </div>

        {/* One line, reserved even when empty, so lanes don't jump as actions arrive. */}
        <p
          key={actionKey}
          className={cn(
            'min-h-[1.4em] truncate type-meta',
            lane.state === 'failed' ? 'text-desk-red' : 'text-desk-ink-2',
            actionKey !== firstKey &&
              (lane.state === 'done'
                ? 'animate-[fade-in_var(--dur-base)_var(--ease-out)]'
                : 'animate-[fade-in_var(--dur-quick)_var(--ease-out)]'),
          )}
          title={line ?? undefined}
        >
          {line}
        </p>

        {note && lane.state !== 'skipped' && (
          <>
            {/* 04 §4: Kalam is for short margin notes (≤6 words); a longer note is set as reading text. */}
            <p
              aria-hidden="true"
              className={cn(
                'mt-1 text-desk-ink',
                note.text.trim().split(/\s+/).length <= 6 ? 'font-note type-note' : 'font-display text-[0.9375rem] leading-snug',
              )}
            >
              {note.text}
            </p>
            <p className="sr-only">{note.text}</p>
          </>
        )}
      </div>
    </li>
  );
}

/** The lanes in server order; a parallel group gets a bracket labelled "In parallel" (S3.3). */
export function LaneList({
  groups,
  clock,
  debateReason,
}: {
  groups: LaneGroup[];
  clock: LaneClock;
  debateReason: string | null;
}) {
  return (
    <ol className="flex flex-col">
      {groups.map((g) =>
        g.parallel ? (
          <li key={g.group} className="my-1 border-l-(length:--rule) border-desk-line pl-3">
            <p className="pt-2 type-meta text-desk-ink-2">In parallel</p>
            <ol aria-label="These agents work at the same time">
              {g.lanes.map((lane) => (
                <AgentLane key={lane.id} lane={lane} clock={clock} debateReason={debateReason} />
              ))}
            </ol>
          </li>
        ) : (
          g.lanes.map((lane) => <AgentLane key={lane.id} lane={lane} clock={clock} debateReason={debateReason} />)
        ),
      )}
    </ol>
  );
}

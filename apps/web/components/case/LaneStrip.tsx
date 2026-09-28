'use client';

import { cn } from 'cn';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { agentIdentity, deskInkClass } from '@/lib/agents.config';
import type { Lane, LaneGroup, LaneState } from '@/lib/runs/reducer';
import { LaneList, type LaneClock } from './AgentLane';

// Narrow screens (04 §5, S3.7). Mobile: a sticky strip of 7 state dots + what is happening now; a
// tap opens every lane in a bottom sheet. Tablet: a 64px rail of glyphs that opens the same sheet.
// Each state has its own shape, so the dots never rely on color alone.

const STATE_WORDS: Record<LaneState, string> = {
  queued: 'waiting',
  working: 'working',
  waiting: 'second round',
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
};

function StateDot({ state }: { state: LaneState }) {
  const common = 'size-2.5 shrink-0';
  switch (state) {
    case 'done':
      return (
        <svg viewBox="0 0 10 10" className={cn(common, 'text-desk-ink')} aria-hidden="true">
          <circle cx="5" cy="5" r="4.25" fill="currentColor" />
        </svg>
      );
    case 'working':
    case 'waiting':
      return (
        <svg viewBox="0 0 10 10" className={cn(common, 'text-desk-ink')} aria-hidden="true">
          <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M5 1 A4 4 0 0 1 5 9 Z" fill="currentColor" />
        </svg>
      );
    case 'failed':
      return (
        <svg viewBox="0 0 10 10" className={cn(common, 'text-desk-red')} aria-hidden="true">
          <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'skipped':
      return (
        <svg viewBox="0 0 10 10" className={cn(common, 'text-desk-ink-2')} aria-hidden="true">
          <path d="M2 5 H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 10 10" className={cn(common, 'text-desk-ink-2')} aria-hidden="true">
          <circle cx="5" cy="5" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      );
  }
}

function LanesSheet({
  open,
  onOpenChange,
  groups,
  clock,
  debateReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: LaneGroup[];
  clock: LaneClock;
  debateReason: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" surface="desk" className="max-h-[92dvh] rounded-t-sheet">
        <SheetHeader>
          <SheetTitle className="text-desk-ink">The desk</SheetTitle>
          <SheetDescription className="text-desk-ink-2">What each agent has done on this case.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <LaneList groups={groups} clock={clock} debateReason={debateReason} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function LaneStrip({
  lanes,
  groups,
  activity,
  clock,
  debateReason,
}: {
  lanes: Lane[];
  groups: LaneGroup[];
  /** What is happening now, in words (the current agent's action, or the run's status). */
  activity: string;
  clock: LaneClock;
  debateReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const summary = lanes.map((l) => `${agentIdentity(l.id, l.name).displayName} ${STATE_WORDS[l.state]}`).join(', ');

  return (
    <aside aria-label="Agents" className="sticky top-14 z-30 border-b-(length:--rule) border-desk-line bg-desk-raised md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 text-left"
      >
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {lanes.map((l) => (
            <StateDot key={l.id} state={l.state} />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate type-meta text-desk-ink">{activity}</span>
        <span className="sr-only">. Agents: {summary}. Show every agent.</span>
      </button>
      <LanesSheet open={open} onOpenChange={setOpen} groups={groups} clock={clock} debateReason={debateReason} />
    </aside>
  );
}

export function LaneRail({
  lanes,
  groups,
  clock,
  debateReason,
}: {
  lanes: Lane[];
  groups: LaneGroup[];
  clock: LaneClock;
  debateReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <aside aria-label="Agents" className="hidden w-16 shrink-0 border-r-(length:--rule) border-desk-line md:block xl:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="sticky top-14 flex w-full cursor-pointer flex-col items-center gap-4 py-4"
      >
        <span className="sr-only">Show every agent</span>
        {lanes.map((l) => {
          const id = agentIdentity(l.id, l.name);
          const Glyph = id.glyph;
          return (
            <span key={l.id} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  deskInkClass[id.ink],
                  l.state === 'queued' && 'opacity-50',
                  l.state === 'skipped' && 'opacity-40',
                )}
              >
                <Glyph className={cn(l.state === 'working' && 'boil')} />
              </span>
              <StateDot state={l.state} />
              <span className="sr-only">
                {id.displayName}: {STATE_WORDS[l.state]}.
              </span>
            </span>
          );
        })}
      </button>
      <LanesSheet open={open} onOpenChange={setOpen} groups={groups} clock={clock} debateReason={debateReason} />
    </aside>
  );
}

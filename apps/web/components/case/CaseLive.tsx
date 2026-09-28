'use client';

import { cn } from 'cn';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useState, ViewTransition } from 'react';
import { Chip } from '@/components/ui/chip';
import { PaperclipGlyph } from '@/components/glyphs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { agentIdentity } from '@/lib/agents.config';
import { useHealth } from '@/lib/api';
import { createAnnouncer, labelWords, stageWords } from '@/lib/runs/announcer';
import { startRun } from '@/lib/runs/api';
import type { ConnectionStatus } from '@/lib/runs/connection';
import {
  claimLabel,
  currentLane,
  debateReason,
  evidenceUses,
  laneCounts,
  laneGroups,
  lanes as selectLanes,
  orderedClaims,
  stepsReached,
  stripEvidence,
  type RunState,
} from '@/lib/runs/reducer';
import type { Label, RunEvent } from '@/lib/runs/types';
import { useRunEvents } from '@/lib/runs/useRunEvents';
import { LaneList, type LaneClock } from './AgentLane';
import { ClaimStrip } from './ClaimStrip';
import { EvidenceTray } from './EvidenceTray';
import { LaneRail, LaneStrip } from './LaneStrip';
import {
  BlockedNotice,
  ExpiredNotice,
  FailedCard,
  InterruptedBanner,
  QueuedNotice,
  WakingNotice,
} from './RunNotices';

// The live investigation board (P3, 07 §3). A projection of the run's event log: every region
// reads a slice of the reducer's state; nothing here advances or invents progress.

export type CasePhase =
  | 'expired'
  | 'waking'
  | 'connecting'
  | 'queued'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'failed';

export function casePhase(
  state: RunState,
  connection: ConnectionStatus,
  opts: { expired: boolean; healthPending: boolean },
): CasePhase {
  if (opts.expired) return 'expired';
  if (state.status === 'completed' || state.status === 'failed') return state.status;
  if (connection === 'reconnecting' || connection === 'interrupted') return 'interrupted';
  if (state.status === 'queued') return 'queued';
  if (state.status === 'running') return 'running';
  return opts.healthPending ? 'waking' : 'connecting';
}

function statusLine(phase: CasePhase, state: RunState): string {
  const counts = laneCounts(state);
  const total = state.agentOrder.length;
  switch (phase) {
    case 'expired':
      return 'This case is no longer stored.';
    case 'waking':
      return 'Waking the desk.';
    case 'connecting':
      return 'Opening the case.';
    case 'queued':
      return 'Waiting for a free desk.';
    case 'running':
      return `Checking · ${counts.done} of ${total} agents done.`;
    case 'interrupted':
      return 'Lost connection. The check may still be running.';
    case 'completed': {
      const secs = state.completed?.totalMs ? ` in ${(state.completed.totalMs / 1000).toFixed(1)}s` : '';
      return state.verdict?.overall.label === 'blocked' ? 'Not checked.' : `Checked${secs}.`;
    }
    case 'failed':
      return state.failure
        ? `Stopped at the ${stageWords(state.failure.stage)} step. No verdict.`
        : 'Stopped. No verdict.';
  }
}

function activityLine(phase: CasePhase, state: RunState): string {
  const lane = currentLane(state);
  if (lane) {
    const name = agentIdentity(lane.id, lane.name).displayName;
    if (lane.state === 'waiting') return `${name}: second round`;
    return lane.action ? `${name}: ${lane.action.label}` : `${name}: working`;
  }
  const total = state.agentOrder.length;
  if (phase === 'completed') {
    const ran = laneCounts(state).done;
    const secs = state.completed?.totalMs ? ` · ${(state.completed.totalMs / 1000).toFixed(1)}s` : ' · done';
    return ran === total ? `${total} agents${secs}` : `${ran} of ${total} agents ran${secs}`;
  }
  return statusLine(phase, state);
}

const LABEL_TONE: Record<Label, 'support' | 'contradicted' | 'ochre' | 'graphite'> = {
  supported: 'support',
  contradicted: 'contradicted',
  mixed: 'ochre',
  missing_context: 'ochre',
  unverifiable: 'graphite',
  blocked: 'graphite',
};

const BAND_WORDS = { strong: 'Strong evidence', moderate: 'Moderate evidence', weak: 'Weak evidence' } as const;

export interface CaseLiveProps {
  runId: string;
  /** Backend (or dev fixture) base URL; the connection appends /runs/{id}/events. */
  baseUrl?: string;
  initialEvents?: RunEvent[];
  /** The server said the run doesn't exist (expired or never stored). */
  expired?: boolean;
  /** Dev fixture replay: no /health gating, no re-run against the real backend. */
  fixture?: { name: string; speed: number } | null;
}

export function CaseLive({ runId, baseUrl, initialEvents, expired = false, fixture = null }: CaseLiveProps) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState('');
  // Only live events are announced; a stored log that was already there on load stays quiet.
  const [announcer] = useState(() =>
    createAnnouncer(setAnnouncement, (id) => (id ? agentIdentity(id).displayName : 'The desk')),
  );
  useEffect(() => () => announcer.dispose(), [announcer]);

  const onEvents = useCallback(
    (events: RunEvent[]) => {
      for (const e of events) announcer.push(e);
    },
    [announcer],
  );

  const { state, connection, retry, receivedAt } = useRunEvents(
    expired ? null : runId,
    { baseUrl, initialEvents },
    onEvents,
  );
  const health = useHealth();
  const phase = casePhase(state, connection, {
    expired,
    healthPending: !fixture && !health.isSuccess && !health.isError,
  });

  const laneList = selectLanes(state);
  const groups = useMemo(() => laneGroups(state), [state]);
  const reason = debateReason(state);
  const clock: LaneClock = { lastTMs: state.lastTMs, receivedAt, rate: fixture?.speed ?? 1 };
  const claims = orderedClaims(state);
  const cards = state.evidenceOrder.map((id) => state.evidence[id]).filter(Boolean);
  const usesOf = useCallback((id: string) => evidenceUses(state, id), [state]);
  const blocked = state.verdict?.overall.label === 'blocked';

  const [filterClaim, setFilterClaim] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  // Tablet: the tray is a right sheet; mobile: a bottom sheet (04 §5). Decided when it opens.
  const [traySide, setTraySide] = useState<'right' | 'bottom'>('right');
  const openTray = () => {
    setTraySide(window.matchMedia('(min-width: 48rem)').matches ? 'right' : 'bottom');
    setTrayOpen(true);
  };
  const trayHeading = useId();
  const sheetTrayHeading = useId();
  const filterPart = filterClaim ? claims.findIndex((c) => c.claim_id === filterClaim) + 1 : 0;
  const filter = filterClaim && filterPart ? { part: filterPart, ids: stripEvidence(state, filterClaim).ids } : null;

  const showEvidence = (claimId: string) => {
    setFilterClaim(claimId);
    if (window.matchMedia('(min-width: 80rem)').matches) {
      document.getElementById('evidence-tray')?.scrollIntoView({ block: 'start' });
      document.getElementById('evidence-tray')?.focus({ preventScroll: true });
    } else {
      openTray();
    }
  };

  const text = state.input?.text ?? null;
  const rerun = useMemo(() => {
    if (fixture || !text) return null;
    return async () => {
      const created = await startRun(text, state.kb?.id);
      router.push(`/case/${created.run_id}`);
    };
  }, [fixture, text, state.kb?.id, router]);

  const hasNotice =
    phase === 'waking' ||
    (phase === 'queued' && state.queuePosition != null) ||
    (phase === 'failed' && !!state.failure) ||
    (phase === 'completed' && !!state.verdict);

  const emptyTray =
    phase === 'completed' || phase === 'failed'
      ? 'No sources were pinned for this message.'
      : 'Sources appear here as the Clipper pins them.';

  return (
    <div data-run-status={phase} data-run-id={runId} className="flex flex-1 flex-col">
      {/* Case bar: where you are and what the run is doing, in words (role=status, changes on events only). */}
      <section aria-label="Case" className="border-b-(length:--rule) border-desk-line">
        <div className="mx-auto flex min-h-12 max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:px-6">
          <Link
            href="/"
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-button px-2 type-ui text-desk-ink-2 hover:text-desk-ink"
          >
            <ChevronLeft aria-hidden="true" className="size-4 stroke-[1.5]" />
            New check
          </Link>
          <p className="hidden type-meta text-desk-ink-2 md:block">
            Case <span className="tabular-nums">{runId}</span>
            {fixture && (
              <>
                {' · '}
                {fixture.name.startsWith('synthetic-') ? 'synthetic test log, not a real check' : 'recorded run'}, replayed
                {fixture.speed !== 1 ? ` at ${fixture.speed}×` : ''}
              </>
            )}
          </p>
          {/* On mobile the lane strip below says what's happening, so the line is for screen readers only. */}
          <p role="status" className="type-meta text-desk-ink max-md:sr-only md:ml-auto">
            {statusLine(phase, state)}
          </p>
          {(cards.length > 0 || claims.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setFilterClaim(null);
                openTray();
              }}
              aria-haspopup="dialog"
              className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-button px-2 type-ui text-desk-ink hover:bg-desk-raised md:ml-0 xl:hidden"
            >
              <PaperclipGlyph aria-hidden="true" className="size-5 text-desk-graphite" />
              <span className="tabular-nums">{cards.length === 1 ? '1 source' : `${cards.length} sources`}</span>
              <span className="sr-only">: open the evidence</span>
            </button>
          )}
        </div>
      </section>

      <LaneStrip
        lanes={laneList}
        groups={groups}
        activity={activityLine(phase, state)}
        clock={clock}
        debateReason={reason}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        <LaneRail lanes={laneList} groups={groups} clock={clock} debateReason={reason} />

        <aside aria-label="Agents" className="hidden w-[280px] shrink-0 border-r-(length:--rule) border-desk-line px-5 py-6 xl:block">
          <h2 className="type-ui font-semibold text-desk-ink">The desk</h2>
          {laneList.length === 0 ? (
            <p className="mt-3 type-meta text-desk-ink-2">The agents appear when the check starts.</p>
          ) : (
            <div className="mt-2">
              <LaneList groups={groups} clock={clock} debateReason={reason} />
            </div>
          )}
        </aside>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-8">
          {phase === 'interrupted' && (
            <InterruptedBanner
              step={stepsReached(state)}
              gaveUp={connection === 'interrupted'}
              onReconnect={retry}
              onRerun={rerun}
            />
          )}

          <article className="paper mx-auto max-w-[760px] rounded-sheet px-5 py-8 shadow-lift-sheet md:px-12 md:py-12">
            {phase === 'expired' ? (
              <>
                <h1 className="sr-only">Case {runId}</h1>
                <ExpiredNotice />
              </>
            ) : (
              <>
                <header>
                  {text ? (
                    <>
                      <p className="type-meta font-semibold text-ink-2">The message you were forwarded</p>
                      <ViewTransition name="claim-text">
                        <h1 className="mt-3 max-w-[68ch] font-display type-claim text-balance text-ink">{text}</h1>
                      </ViewTransition>
                    </>
                  ) : (
                    <h1 className="sr-only">Case {runId}</h1>
                  )}
                </header>

                <div className={cn('flex flex-col gap-6', text && hasNotice && 'mt-8')}>
                  {phase === 'waking' && <WakingNotice />}
                  {phase === 'queued' && state.queuePosition != null && <QueuedNotice position={state.queuePosition} />}
                  {phase === 'failed' && state.failure && (
                    <FailedCard
                      failure={state.failure}
                      kept={{ sources: cards.length, parts: claims.length }}
                      onRerun={rerun}
                    />
                  )}
                  {blocked && state.verdict && <BlockedNotice reason={state.verdict.overall.summary} />}
                  {phase === 'completed' && state.verdict && !blocked && (
                    <section aria-labelledby="verdict-title" data-verdict={state.verdict.overall.label}>
                      <h2 id="verdict-title" className="sr-only">
                        Verdict
                      </h2>
                      <Chip tone={LABEL_TONE[state.verdict.overall.label]}>
                        {labelWords(state.verdict.overall.label).replace(/^./, (c) => c.toUpperCase())}
                      </Chip>
                      <p className="mt-3 type-meta font-semibold text-ink-2">ACHP&apos;s reading</p>
                      <p className="mt-1 max-w-[68ch] type-body text-ink-2">{state.verdict.overall.summary}</p>
                      <p className="mt-2 max-w-[68ch] type-meta text-ink-2">
                        {BAND_WORDS[state.verdict.overall.confidence_band]}. {state.verdict.overall.confidence_reason}
                      </p>
                    </section>
                  )}
                </div>

                {claims.length > 0 && (
                  <section aria-labelledby="parts-title" className="mt-8">
                    <h2 id="parts-title" className="type-meta font-semibold text-ink-2">
                      {claims.length === 1 ? 'The checkable part' : `${claims.length} checkable parts`}
                    </h2>
                    <ol className="mt-3">
                      {claims.map((c, i) => (
                        <ClaimStrip
                          key={c.claim_id}
                          strip={c}
                          part={i + 1}
                          evidence={stripEvidence(state, c.claim_id)}
                          label={claimLabel(state, c.claim_id)}
                          onShowEvidence={showEvidence}
                        />
                      ))}
                    </ol>
                  </section>
                )}
              </>
            )}
          </article>
        </main>

        <aside
          aria-label="Evidence"
          id="evidence-tray"
          tabIndex={-1}
          className={cn('hidden w-[340px] shrink-0 border-l-(length:--rule) border-desk-line px-5 py-6 outline-none xl:block')}
        >
          <EvidenceTray
            cards={cards}
            usesOf={usesOf}
            filter={filter}
            onClearFilter={() => setFilterClaim(null)}
            headingId={trayHeading}
            emptyText={emptyTray}
          />
        </aside>
      </div>

      <Sheet open={trayOpen} onOpenChange={setTrayOpen}>
        <SheetContent
          side={traySide}
          surface="desk"
          className={traySide === 'bottom' ? 'max-h-[92dvh] rounded-t-sheet' : 'w-[min(90vw,380px)]'}
        >
          <SheetHeader>
            <SheetTitle className="text-desk-ink">Evidence</SheetTitle>
            <SheetDescription className="text-desk-ink-2">
              {cards.length === 1 ? '1 source' : `${cards.length} sources`} the Clipper pinned for this case.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <EvidenceTray
              cards={cards}
              usesOf={usesOf}
              filter={filter}
              onClearFilter={() => setFilterClaim(null)}
              headingId={sheetTrayHeading}
              emptyText={emptyTray}
              inSheet
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Paced announcements (S9.1): at most one sentence every 2s, most important first. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

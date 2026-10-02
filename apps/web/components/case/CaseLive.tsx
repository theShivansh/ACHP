'use client';

import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Roll } from '@/components/ui/roll';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssayTab } from '@/components/assay/AssayTab';
import { Hallmark } from '@/components/assay/Hallmark';
import { MaskingNotice } from '@/components/assay/MaskingNotice';
import { TwoKey } from '@/components/assay/TwoKey';
import { PaperclipGlyph } from '@/components/glyphs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { agentIdentity } from '@/lib/agents.config';
import { useHealth } from '@/lib/api';
import { createAnnouncer, stageWords } from '@/lib/runs/announcer';
import { apiBase, startRun } from '@/lib/runs/api';
import { isRememberable, rememberRun } from '@/lib/runs/history';
import { openCase } from '@/lib/transitions';
import type { ConnectionStatus } from '@/lib/runs/connection';
import {
  boilingLanes,
  claimLabel,
  currentLane,
  flaggedSpans,
  laneSignals,
  debateReason,
  evidenceUses,
  laneCounts,
  laneGroups,
  lanes as selectLanes,
  orderedClaims,
  partNumbers,
  stepsReached,
  stripEvidence,
  type RunState,
} from '@/lib/runs/reducer';
import type { RunEvent } from '@/lib/runs/types';
import { METRIC_INFO, METRICS, tippingSentence } from '@/lib/assay/present';
import type { BandKey } from '@/lib/verdict';
import { useRunEvents } from '@/lib/runs/useRunEvents';
import { LaneFx, LaneList, type LaneClock } from './AgentLane';
import { ArrivalProvider } from './arrival';
import { ClaimHeadline, HighlightKey, type RuledPart } from './ClaimHeadline';
import { ClaimMorph } from './ClaimMorph';
import { ClaimStrip } from './ClaimStrip';
import { ScissorsCut } from './ScissorsCut';
import { EvidenceTray } from './EvidenceTray';
import { LaneRail, LaneStrip } from './LaneStrip';
import { LinkProvider } from './linkStore';
import { ConfidenceBand, EditorsDesk, InterpretationNote, PartsThatDontHold, ShareBar } from './ReportParts';
import { Stamp } from './Stamp';
import {
  BlockedNotice,
  ExpiredNotice,
  FailedCard,
  InterruptedBanner,
  QueuedNotice,
  WakingNotice,
} from './RunNotices';

// The trace (its own tab) and the method notes (below the report) load as their own chunks (09 §3).
const TraceTable = dynamic(() => import('./TraceTable').then((m) => m.TraceTable));
const MethodDrawer = dynamic(() => import('./MethodDrawer').then((m) => m.MethodDrawer));

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

/** What the status region says: only states no event announces (the connection, a cold start). */
function connectionSentence(phase: CasePhase, connection: ConnectionStatus): string {
  if (phase === 'waking') return 'Waking the desk. This can take up to a minute.';
  if (phase === 'interrupted') {
    return connection === 'interrupted' ? 'Lost connection. The check may still be running.' : 'Lost connection. Reconnecting.';
  }
  return '';
}

/** "7 agents · 18.2s · 1 debate round": the folded lanes of a finished case (07 §3.1). */
function laneSummary(state: RunState): string {
  const total = state.agentOrder.length;
  const ran = laneCounts(state).done;
  const parts = [ran === total ? `${total} agents` : `${ran} of ${total} agents ran`];
  if (state.completed?.totalMs) parts.push(`${(state.completed.totalMs / 1000).toFixed(1)}s`);
  const rounds = state.debateRounds.length;
  if (rounds > 0) parts.push(`${rounds} debate round${rounds === 1 ? '' : 's'}`);
  return parts.join(' · ');
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



const TABS = ['report', 'evidence', 'assay', 'trace'] as const;
type TabId = (typeof TABS)[number];

export interface CaseLiveProps {
  runId: string;
  /** Backend (or dev fixture) base URL; the connection appends /runs/{id}/events. */
  baseUrl?: string;
  initialEvents?: RunEvent[];
  /** The server said the run doesn't exist (expired or never stored). */
  expired?: boolean;
  /** Dev fixture replay: no /health gating, no re-run against the real backend. */
  fixture?: { name: string; speed: number } | null;
  /** A recorded example shipped with the app: a stored case, labelled as such, with no re-run. */
  sample?: boolean;
  /** Text of EVALUATION.md, when the repo has one (read on the server, never written here). */
  benchmark?: string | null;
}

export function CaseLive({ runId, baseUrl, initialEvents, expired = false, fixture = null, sample = false, benchmark = null }: CaseLiveProps) {
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
  // This browser's checks: a case opened here is listed on /runs (ids only; the stored log is the source of truth).
  useEffect(() => {
    if (!expired && isRememberable(runId)) rememberRun(runId);
  }, [runId, expired]);
  const pathname = usePathname();
  const search = useSearchParams();
  const tab: TabId = TABS.includes(search.get('tab') as TabId) ? (search.get('tab') as TabId) : 'report';
  const setTab = (next: string) => {
    const q = new URLSearchParams(search.toString());
    if (next === 'report') q.delete('tab');
    else q.set('tab', next);
    // The native history call, which Next syncs into useSearchParams: the tab (and the sliding rule under it) changes
    // at once instead of waiting on a server round trip for a change that has no new data.
    window.history.replaceState(null, '', q.size ? `${pathname}?${q}` : pathname);
  };
  const apiUrl = baseUrl ?? apiBase();
  const phase = casePhase(state, connection, {
    expired,
    healthPending: !fixture && !health.isSuccess && !health.isError,
  });

  const laneList = selectLanes(state);
  const groups = useMemo(() => laneGroups(state), [state]);
  // Kept stable while its contents are: every lane reads it, so a new object per event would re-render them all.
  const boilKey = [...boilingLanes(state, phase === 'running')].join(',');
  const signals = laneSignals(state);
  const signalKey = JSON.stringify(signals);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value on purpose
  const laneFx = useMemo(() => ({ boiling: new Set(boilKey ? boilKey.split(',') : []), signals }), [boilKey, signalKey]);
  const flagged = useMemo(() => flaggedSpans(state), [state]);
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
  // The sheets open from buttons outside any SheetTrigger, so focus goes back by hand on close.
  const returnTo = useRef<HTMLElement | null>(null);
  const openTray = () => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTraySide(window.matchMedia('(min-width: 48rem)').matches ? 'right' : 'bottom');
    setTrayOpen(true);
  };
  const trayHeading = useId();
  const sheetTrayHeading = useId();
  const evidenceTabHeading = useId();
  const [lanesOpen, setLanesOpen] = useState(false);
  // A source chip in the reading opens the Evidence tab; the card is focused once the tab has rendered.
  const focusCard = useRef<string | null>(null);
  useEffect(() => {
    const id = focusCard.current;
    if (tab !== 'evidence' || !id) return;
    // The tab's content mounts a frame after the tab changes, so look for the card for a few frames.
    let frame = 0;
    let tries = 0;
    const seek = () => {
      const card = document.querySelector<HTMLElement>(`[role="tabpanel"] [data-evidence="${id}"]`);
      if (card) {
        focusCard.current = null;
        card.scrollIntoView({ block: 'center' });
        card.focus({ preventScroll: true });
      } else if ((tries += 1) < 10) frame = requestAnimationFrame(seek);
    };
    seek();
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  // Adversary B's missing perspectives, as the Judge recorded them per part (never invented).
  const parts = partNumbers(state);
  const voicesNotHeard = (state.verdict?.claims ?? []).flatMap((c) =>
    c.missing_context && parts[c.claim_id] ? [{ part: parts[c.claim_id], text: c.missing_context }] : [],
  );
  // The reading's citations: the sources the Judge cited across the parts, by their number in the
  // Evidence tab (order of arrival), and the parts it did not rule Supported.
  const citedIds = new Set((state.verdict?.claims ?? []).flatMap((c) => [...(c.evidence_for ?? []), ...(c.evidence_against ?? [])]));
  const cited = state.evidenceOrder.flatMap((id, i) => (citedIds.has(id) ? [{ id, n: i + 1 }] : []));
  const notHolding = claims.flatMap((c, i) => {
    const l = claimLabel(state, c.claim_id);
    return l && l !== 'supported' && l !== 'blocked' ? [{ claimId: c.claim_id, part: i + 1, label: l, text: c.text }] : [];
  });
  // Each part the Judge did not rule Supported, at its own words in the message, so its mark sits under them.
  const ruled: RuledPart[] =
    phase === 'completed' && !blocked
      ? claims.flatMap((c) => {
          const l = claimLabel(state, c.claim_id);
          return l && l !== 'supported' && l !== 'blocked' ? [{ claimId: c.claim_id, span: c.source_span, label: l }] : [];
        })
      : [];
  const openSource = (evidenceId: string) => {
    focusCard.current = evidenceId;
    setTab('evidence');
  };
  const filterPart = filterClaim ? claims.findIndex((c) => c.claim_id === filterClaim) + 1 : 0;
  const filter = filterClaim && filterPart ? { part: filterPart, ids: stripEvidence(state, filterClaim).ids } : null;

  const showEvidence = (claimId: string) => {
    setFilterClaim(claimId);
    if (window.matchMedia('(min-width: 80rem)').matches) {
      document.getElementById('evidence-tray')?.scrollIntoView({ block: 'start' });
      // Focus the tray's heading once the filtered list has rendered (a visible, named target).
      requestAnimationFrame(() => document.getElementById(trayHeading)?.focus({ preventScroll: true }));
    } else {
      openTray();
    }
  };

  const text = state.input?.text ?? null;
  const rerun = useMemo(() => {
    if (fixture || sample || !text) return null;
    return async () => {
      const created = await startRun(text, state.kb?.id);
      openCase(router, created.run_id);
    };
  }, [fixture, sample, text, state.kb?.id, router]);

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
    <ArrivalProvider lastSeq={state.lastSeq}>
    <LaneFx value={laneFx}>
    <LinkProvider>
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
          {/* The run line is read in place, not spoken: the paced announcer already says every
              event-driven change (S9.1). The status region speaks only what no event carries:
              waking, reconnecting, lost connection. */}
          <p data-status-line className="type-meta text-desk-ink max-md:sr-only md:ml-auto">
            {statusLine(phase, state)}
          </p>
          <span role="status" className="sr-only">
            {connectionSentence(phase, connection)}
          </span>
          {(cards.length > 0 || claims.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setFilterClaim(null);
                // A finished case has the list in its Evidence tab; a running one keeps the report and opens the sheet.
                if (phase === 'completed') setTab('evidence');
                else openTray();
              }}
              aria-haspopup={phase === 'completed' ? undefined : 'dialog'}
              className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-button px-2 type-ui text-desk-ink hover:bg-desk-raised md:ml-0 xl:hidden"
            >
              <PaperclipGlyph aria-hidden="true" className="size-5 text-desk-graphite" />
              <span>
                <Roll value={cards.length} /> {cards.length === 1 ? 'source' : 'sources'}
              </span>
              <span className="sr-only">: open the evidence</span>
            </button>
          )}
        </div>
      </section>

      {/* A recorded or test case says what it is at every width: never mistakable for a real check (07 §3.3, rule 4). */}
      {(sample || fixture) && (
        <aside aria-label="Recorded example" data-recorded-notice className="border-b-(length:--rule) border-desk-line bg-desk-raised px-4 py-2 text-center type-meta text-desk-ink md:px-6">
          {sample
            ? 'A recorded example, not a new check.'
            : fixture?.name.startsWith('synthetic-')
              ? 'A synthetic test log, not a real check.'
              : 'A recorded check, replayed.'}
        </aside>
      )}

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
            // Done: the lanes fold into one summary line (07 §3.1); the details stay one click away.
            // A real disclosure (display: none), not <details>: a closed <details> skips style
            // updates, which left a finished lane's boil animation running.
            <div className="mt-2">
              {phase === 'completed' && (
                <button
                  type="button"
                  data-lane-summary
                  aria-expanded={lanesOpen}
                  aria-controls="lane-list"
                  onClick={() => setLanesOpen((o) => !o)}
                  className="flex min-h-11 w-full cursor-pointer items-center text-left type-meta text-desk-ink-2 hover:text-desk-ink"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn('mr-1 size-4 stroke-[1.5] transition-transform duration-(--dur-quick) motion-reduce:transition-none', lanesOpen && 'rotate-90')}
                  />
                  {laneSummary(state)}
                </button>
              )}
              <div id="lane-list" hidden={phase === 'completed' && !lanesOpen}>
                <LaneList groups={groups} clock={clock} debateReason={reason} />
              </div>
            </div>
          )}
        </aside>

        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 scroll-mt-14 px-4 py-6 outline-none max-md:scroll-mt-26 md:px-8"
        >
          {phase === 'interrupted' && (
            <InterruptedBanner
              step={stepsReached(state)}
              gaveUp={connection === 'interrupted'}
              onReconnect={retry}
              onRerun={rerun}
            />
          )}

          <Tabs value={tab} onValueChange={setTab} className="mx-auto max-w-[760px]">
            {phase !== 'expired' && (
              <TabsList aria-label="Case sections" className="max-[22.5rem]:gap-2.5">
                <TabsTrigger value="report">Report</TabsTrigger>
                <TabsTrigger value="evidence">
                  Evidence{' '}
                  <span>
                    (<Roll value={cards.length} />)
                  </span>
                </TabsTrigger>
                {phase === 'completed' && !blocked && <TabsTrigger value="assay">The Assay</TabsTrigger>}
                <TabsTrigger value="trace">Trace</TabsTrigger>
              </TabsList>
            )}
            <article className="paper rounded-sheet px-5 py-8 shadow-lift-sheet md:px-12 md:py-12">
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
                        <ClaimMorph>
                          <ClaimHeadline
                            text={text}
                            spans={flagged}
                            ruled={ruled}
                            className="mt-3 max-w-[68ch] font-display type-claim text-balance text-ink"
                          />
                        </ClaimMorph>
                      </>
                    ) : (
                      <h1 className="sr-only">Case {runId}</h1>
                    )}
                    {phase === 'completed' && state.verdict && (
                      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
                        <Stamp label={state.verdict.overall.label} id={runId} size="overall" />
                        {state.assay && !blocked && tab === 'report' && <Hallmark metrics={state.assay.metrics} size={40} punch />}
                      </div>
                    )}
                    {/* Which part? Said right under the stamp, with the same marks drawn on those words above. */}
                    {phase === 'completed' && state.verdict && !blocked && <PartsThatDontHold parts={notHolding} />}
                    {phase === 'completed' && state.assay && !blocked && tab === 'report' && (
                      <>
                        {/* Touch readers never see the tooltips, so the five scores are named here, in full, once. */}
                        <p data-hallmark-legend className="mt-2 max-w-[68ch] type-meta text-ink-2">
                          The five scores, left to right:{' '}
                          {METRICS.map((m, i) => (
                            <span key={m}>
                              {i > 0 && ' · '}
                              {METRIC_INFO[m].full}
                              {METRIC_INFO[m].lowerIsBetter && ' (lower is better)'}
                            </span>
                          ))}
                          .{' '}
                          <button
                            type="button"
                            onClick={() => setTab('assay')}
                            className="inline-flex min-h-6 cursor-pointer items-center text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
                          >
                            What they mean, on The Assay tab
                          </button>
                        </p>
                        <TwoKey assay={state.assay} arrive className="mt-4" />
                      </>
                    )}
                    {text && <HighlightKey text={text} spans={flagged} className="mt-4" />}
                  </header>

                  <TabsContent value="report">
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
                          <InterpretationNote sources={cited} onOpenSource={openSource}>
                            {state.verdict.overall.summary}
                          </InterpretationNote>
                          {state.assay && <MaskingNotice assay={state.assay} className="mt-4 max-w-[68ch]" />}
                          <ConfidenceBand
                            className="mt-4"
                            band={state.verdict.overall.confidence_band as BandKey}
                            reason={state.verdict.overall.confidence_reason}
                          />
                          {state.assay?.tipping_point && (
                            <p data-tipping-sentence className="mt-3 max-w-[68ch] type-body text-pretty text-ink-2">
                              <span className="font-semibold text-ink">About the formula. </span>
                              {tippingSentence(state.assay.tipping_point)}
                            </p>
                          )}
                          <EditorsDesk band={state.verdict.overall.confidence_band as BandKey} />
                        </section>
                      )}
                    </div>

                    {claims.length > 0 && (
                      <section aria-labelledby="parts-title" className="mt-8">
                        <h2 id="parts-title" className="type-meta font-semibold text-ink-2">
                          {claims.length === 1 ? 'The checkable part' : `${claims.length} checkable parts`}
                        </h2>
                        <ScissorsCut />
                        <ol className="mt-3">
                          {claims.map((c, i) => (
                            <ClaimStrip
                              key={c.claim_id}
                              strip={c}
                              part={i + 1}
                              stopped={phase === 'failed'}
                              showStamp={claims.length > 1}
                              evidence={stripEvidence(state, c.claim_id)}
                              label={claimLabel(state, c.claim_id)}
                              onShowEvidence={showEvidence}
                            />
                          ))}
                        </ol>
                      </section>
                    )}

                    {phase === 'completed' && state.verdict && !blocked && text && (
                      <>
                        <ShareBar runId={runId} claim={text} verdict={state.verdict} fixture={!!fixture} />
                        <div className="mt-4">
                          <MethodDrawer benchmark={benchmark} onOpenAssay={() => setTab('assay')} />
                        </div>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="evidence" className="mt-8">
                    <EvidenceTray
                      as="div"
                      cards={cards}
                      usesOf={usesOf}
                      filter={null}
                      onClearFilter={() => {}}
                      headingId={evidenceTabHeading}
                      emptyText={emptyTray}
                      stopped={phase === 'failed'}
                    />
                    {voicesNotHeard.length > 0 && (
                      <section aria-labelledby="voices-title" className="mt-8">
                        <h2 id="voices-title" className="type-ui font-semibold text-ink">
                          Voices not heard
                        </h2>
                        <ul className="mt-3 list-disc pl-5 marker:text-ink-3">
                          {voicesNotHeard.map((v) => (
                            <li key={`${v.part}-${v.text}`} className="max-w-[68ch] type-body text-ink-2">
                              Part {v.part}: {v.text}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </TabsContent>

                  <TabsContent value="assay" className="mt-8">
                    <AssayTab assay={state.assay} />
                  </TabsContent>

                  <TabsContent value="trace" className="mt-8">
                    <TraceTable state={state} runId={runId} baseUrl={apiUrl} />
                  </TabsContent>
                </>
              )}
            </article>
          </Tabs>
        </main>

        <aside
          aria-label="Evidence"
          id="evidence-tray"
          tabIndex={-1}
          className={cn(
            'hidden w-[340px] shrink-0 scroll-mt-16 border-l-(length:--rule) border-desk-line px-5 py-6 outline-none',
            tab !== 'evidence' && 'xl:block',
          )}
        >
          <EvidenceTray
            cards={cards}
            usesOf={usesOf}
            filter={filter}
            onClearFilter={() => setFilterClaim(null)}
            headingId={trayHeading}
            emptyText={emptyTray}
            stopped={phase === 'failed'}
          />
        </aside>
      </div>

      <Sheet open={trayOpen} onOpenChange={setTrayOpen}>
        <SheetContent
          onCloseAutoFocus={(e) => {
            if (returnTo.current?.isConnected) {
              e.preventDefault();
              returnTo.current.focus();
            }
          }}
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
              stopped={phase === 'failed'}
              inSheet
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Paced announcements (S9.1): at most one sentence every 2s, most important first. */}
      <p data-announcer aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </div>
    </LinkProvider>
    </LaneFx>
    </ArrivalProvider>
  );
}

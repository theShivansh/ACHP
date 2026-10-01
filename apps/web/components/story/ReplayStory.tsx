'use client';

import { cn } from 'cn';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { ClaimStrip } from '@/components/case/ClaimStrip';
import { EvidenceCard } from '@/components/case/EvidenceTray';
import { LinkProvider } from '@/components/case/linkStore';
import { ConfidenceBand, InterpretationNote } from '@/components/case/ReportParts';
import { Stamp } from '@/components/case/Stamp';
import { agentIdentity } from '@/lib/agents.config';
import { buildChapters, type Chapter, type Gate } from '@/lib/runs/chapters';
import {
  claimLabel,
  evidenceUses,
  initialRunState,
  orderedClaims,
  reduceRun,
  stripEvidence,
  type ClaimStrip as Strip,
  type Lane,
  type RunState,
} from '@/lib/runs/reducer';
import type { RunEvent } from '@/lib/runs/types';
import type { BandKey } from '@/lib/verdict';
import { GateLines, useNativeTimelines } from './GateLine';
import { StoryRail } from './StoryRail';

// The replay story (05 §2, 07 §2, S7.1–S7.3): any finished case as a scroll story built from its own event
// log. The stage content is the real UI (the same strips, marks, evidence cards and stamps as the report),
// not a mock. The reader sets the pace; the story only lengthens the track at the two moments that matter
// (the first contradiction and the first missing-context finding) and never touches the wheel.

const noop = () => {};

/** What each mark relation is called on the sheet (the same words as the evidence cards). */
const RELATION_WORDS = {
  contradicts: 'disputes',
  missing_context: 'says context is missing in',
  supports: 'backs',
  framing: 'flags the wording of',
  unclear: 'questions',
} as const;

function agentsIn(chapter: Chapter): string[] {
  const ids: string[] = [];
  for (const e of chapter.events) if (e.type.startsWith('agent.') && e.agent && !ids.includes(e.agent)) ids.push(e.agent);
  return ids;
}

/**
 * A strip as this chapter sees it: only the marks whose events belong to the chapter, and not the ones a
 * reading gate opens on (the gate is where those first draw, as the reader scrolls).
 */
function stripFor(strip: Strip, chapter: Chapter | null): Strip {
  if (!chapter) return { ...strip, marks: [] };
  const seqs = new Set(chapter.events.filter((e) => e.type === 'claim.marked').map((e) => e.seq));
  const gated = new Set(chapter.gates.map((g) => g.seq));
  return { ...strip, marks: strip.marks.filter((m) => seqs.has(m.seq) && !gated.has(m.seq)) };
}

function AgentCard({ lane }: { lane: Lane }) {
  const who = agentIdentity(lane.id, lane.name);
  const Glyph = who.glyph;
  const said = lane.state === 'skipped' ? lane.skipReason : (lane.summary ?? lane.notes.at(-1)?.text);
  const note = lane.notes.at(-1)?.text;
  return (
    <li data-agent={lane.id} className="flex gap-3">
      <Glyph aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-ink-2" />
      <div className="min-w-0">
        <p className="type-ui font-semibold text-ink">{who.displayName}</p>
        {said && <p className="type-body text-ink-2">{said}</p>}
        {note && note !== said && <p className="mt-1 type-body text-ink">{note}</p>}
      </div>
    </li>
  );
}

function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-stage-card
      className={cn('reveal paper w-full max-w-[760px] rounded-sheet px-5 py-6 shadow-lift-sheet md:px-10 md:py-8', className)}
    >
      {children}
    </div>
  );
}

function ChapterBody({ chapter, state, reportHref }: { chapter: Chapter; state: RunState; reportHref: string }) {
  const router = useRouter();
  // "N sources" on a part goes to the report's Evidence tab (the story has no tray of its own).
  const openEvidence = () => router.push(`${reportHref}${reportHref.includes('?') ? '&' : '?'}tab=evidence`);
  const claims = orderedClaims(state);
  const agents = agentsIn(chapter);
  switch (chapter.id) {
    case 'claim':
      return <Stage><p className="font-display type-claim text-balance text-ink">{state.input?.text}</p></Stage>;

    case 'gatekeeper':
    case 'framing': {
      const signals = Object.values(state.signals).sort((a, b) => a.seq - b.seq);
      const framed = chapter.id === 'framing';
      return (
        <Stage>
          <ul className="flex flex-col gap-4">
            {agents.map((id) => state.lanes[id] && <AgentCard key={id} lane={state.lanes[id]} />)}
          </ul>
          {framed && signals.length > 0 && (
            <dl className="mt-5 flex flex-col gap-2 border-t-(length:--rule) border-sheet-line pt-4">
              {signals.map((s) => (
                <div key={s.signal} data-signal={s.signal}>
                  <dt className="type-meta font-semibold text-ink-2">{s.signal.replace(/_/g, ' ')}</dt>
                  <dd className="type-body text-ink">{s.explanation ?? s.label}</dd>
                </div>
              ))}
            </dl>
          )}
        </Stage>
      );
    }

    case 'sources': {
      const cards = state.evidenceOrder.map((id) => state.evidence[id]).filter(Boolean);
      const shown = cards.slice(0, 3);
      return (
        <div className="reveal w-full max-w-[760px]">
          {chapter.skipped || cards.length === 0 ? (
            <Stage><ul>{agents.map((id) => state.lanes[id] && <AgentCard key={id} lane={state.lanes[id]} />)}</ul></Stage>
          ) : (
            <>
              <ol className="flex flex-col gap-4">
                {shown.map((c, i) => (
                  <EvidenceCard key={c.evidence_id} card={c} n={i + 1} uses={evidenceUses(state, c.evidence_id)} />
                ))}
              </ol>
              {cards.length > shown.length && (
                <p className="mt-3 type-meta text-desk-ink-2">
                  <Link
                    href={`${reportHref}${reportHref.includes('?') ? '&' : '?'}tab=evidence`}
                    className="inline-flex min-h-6 items-center text-desk-ink underline decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11"
                  >
                    {cards.length - shown.length} more {cards.length - shown.length === 1 ? 'source' : 'sources'} in the report
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      );
    }

    case 'parts':
    case 'challenge': {
      const only = chapter.id === 'challenge' ? chapter : null;
      return (
        <Stage>
          {claims.length > 0 && (
            <ol>
              {claims.map((c, i) => (
                <ClaimStrip
                  key={c.claim_id}
                  strip={stripFor(c, only)}
                  part={i + 1}
                  evidence={{ ids: [], disagree: 0 }}
                  label={null}
                  showStamp={false}
                  compact
                  anchor={false}
                  onShowEvidence={noop}
                />
              ))}
            </ol>
          )}
          {chapter.id === 'challenge' && agents.length > 0 && (
            <ul className="mt-2 flex flex-col gap-4 border-t-(length:--rule) border-sheet-line pt-4">
              {agents.map((id) => state.lanes[id] && <AgentCard key={id} lane={state.lanes[id]} />)}
            </ul>
          )}
        </Stage>
      );
    }

    case 'verdict': {
      const v = state.verdict;
      return (
        <Stage>
          {v ? (
            <>
              <Stamp label={v.overall.label} id={state.runId ?? 'story'} size="overall" />
              {/* The parts come right after the verdict, so the wrong one is seen before the reasoning (the struck
                  strip is the Judge's own mark). One part: the stamp above already is its verdict. */}
              {claims.length > 0 && (
                <ol className="mt-4">
                  {claims.map((c, i) => (
                    <ClaimStrip
                      key={c.claim_id}
                      strip={c}
                      part={i + 1}
                      evidence={stripEvidence(state, c.claim_id)}
                      label={claimLabel(state, c.claim_id)}
                      showStamp={claims.length > 1}
                      compact
                      anchor={false}
                      onShowEvidence={openEvidence}
                    />
                  ))}
                </ol>
              )}
              <InterpretationNote className="mt-4">{v.overall.summary}</InterpretationNote>
              <ConfidenceBand
                className="mt-4"
                band={v.overall.confidence_band as BandKey}
                reason={v.overall.confidence_reason}
              />
            </>
          ) : (
            <p className="type-body text-ink">{state.failure?.message ?? 'There was no verdict.'}</p>
          )}
          <p className="mt-6">
            <Link href={reportHref} className={buttonVariants({ variant: 'secondary' })}>
              Open the full report
            </Link>
          </p>
        </Stage>
      );
    }
  }
}

/**
 * One reading gate: a longer track with a pinned stage. The heading and the struck strip are there from the
 * start (so the stage is never an empty desk with a lone heading), the mark draws with the scroll, and then
 * the quoted counter-evidence and the agent's sentence appear: at most three reveal units (05 §2.3).
 */
function GateTrack({ gate, chapter, state, native }: { gate: Gate; chapter: Chapter['id']; state: RunState; native: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const claims = orderedClaims(state);
  const at = claims.findIndex((c) => c.claim_id === gate.claimId);
  const strip = claims[at];
  // One quote: a gate has at most three reveal units (the mark, the quote, one sentence), and on a phone a
  // stage taller than its 180vh track would scroll away before the reader finished it.
  const cards = gate.evidenceIds.map((id) => state.evidence[id]).filter(Boolean).slice(0, 1);
  const who = agentIdentity(gate.agent ?? '', undefined).displayName;
  const relation = gate.kind === 'contradiction' ? RELATION_WORDS.contradicts : RELATION_WORDS.missing_context;

  const reveals: ReactNode[] = [];
  if (cards.length) {
    reveals.push(
      <ol key="evidence" className="flex flex-col gap-4">
        {cards.map((c) => (
          <EvidenceCard
            key={c.evidence_id}
            card={c}
            n={state.evidenceOrder.indexOf(c.evidence_id) + 1}
            uses={evidenceUses(state, c.evidence_id)}
          />
        ))}
      </ol>,
    );
  }
  if (gate.note) {
    reveals.push(
      <div key="note" className="paper rounded-sheet px-5 py-4 shadow-lift-card md:px-10">
        <p className="type-meta font-semibold text-ink-2">{who}</p>
        <p className="mt-1 max-w-[60ch] type-body text-ink">{gate.note}</p>
      </div>,
    );
  }

  // Native scroll-driven CSS reveals `.line`; otherwise (and not when motion is reduced) Motion drives the same lines.
  const useFallback = !native && !reduced;
  const lineClass = 'w-full max-w-[760px]';
  return (
    <section
      ref={ref}
      data-gate={gate.kind}
      data-chapter={chapter}
      data-gate-seq={gate.seq}
      aria-labelledby={`gate-${gate.seq}`}
      className="story-friction scroll-mt-20"
    >
      <div className="stage flex flex-col justify-center gap-5 py-4">
        <h2 id={`gate-${gate.seq}`} className="type-h2 text-desk-ink">
          {who} {relation} part {at + 1}
        </h2>
        {strip && (
          <ol data-gate-strip className="paper w-full max-w-[760px] rounded-sheet px-5 py-2 shadow-lift-sheet md:px-10">
            <ClaimStrip
              strip={strip}
              part={at + 1}
              evidence={{ ids: [], disagree: 0 }}
              label={null}
              showStamp={false}
              compact
              anchor={false}
              onShowEvidence={noop}
            />
          </ol>
        )}
        {useFallback ? (
          <GateLines containerRef={ref} className={lineClass}>
            {reveals}
          </GateLines>
        ) : (
          reveals.map((node, i) => (
            <div key={i} data-line={i + 1} className={`line ${lineClass}`}>
              {node}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function ReplayStory({
  events,
  reportHref,
  className,
  embedded = false,
}: {
  events: RunEvent[];
  reportHref: string;
  className?: string;
  /** Part of another page (the Desk): a second-level heading, its own title, and a rail shown only while the story is on screen. */
  embedded?: boolean;
}) {
  const state = useMemo(() => events.reduce(reduceRun, initialRunState()), [events]);
  const chapters = useMemo(() => buildChapters(events), [events]);
  const native = useNativeTimelines();

  return (
    <LinkProvider>
      <article
        aria-label="Replay of the check"
        data-story
        className={cn('story relative mx-auto w-full max-w-[1120px] px-4 pb-24 lg:pl-56', className)}
      >
        {embedded ? (
          <>
            <h2 id="how-it-works" tabIndex={-1} className="scroll-mt-20 pt-10 type-h2 text-desk-ink outline-none">
              How a check works
            </h2>
            <p className="mt-1 max-w-[60ch] type-body text-desk-ink-2">
              A recorded check, replayed. Scroll to follow it step by step, or skip to the verdict.
            </p>
          </>
        ) : (
          <>
            <h1 className="pt-10 type-h2 text-desk-ink">Replay of this check</h1>
            <p className="mt-1 max-w-[60ch] type-body text-desk-ink-2">Scroll to follow it step by step, or skip to the verdict.</p>
          </>
        )}
        <StoryRail embedded={embedded} />
        {chapters.map((ch) => (
          <div key={ch.id}>
            <section
              id={`chapter-${ch.id}`}
              data-chapter={ch.id}
              tabIndex={-1}
              aria-labelledby={`chapter-title-${ch.id}`}
              className="story-step flex min-h-svh scroll-mt-14 flex-col justify-center gap-5 py-16 outline-none focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <header className="reveal max-w-[60ch]">
                <h2 id={`chapter-title-${ch.id}`} className="type-h2 text-desk-ink">
                  {ch.title}
                </h2>
                {ch.id !== 'claim' && ch.caption && (
                  <p data-caption className="mt-1 type-body text-desk-ink-2">
                    {ch.caption}
                  </p>
                )}
              </header>
              <ChapterBody chapter={ch} state={state} reportHref={reportHref} />
            </section>
            {ch.gates.map((g) => (
              <GateTrack key={g.seq} gate={g} chapter={ch.id} state={state} native={native} />
            ))}
          </div>
        ))}
      </article>
    </LinkProvider>
  );
}

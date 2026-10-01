// The only place run state changes (CLAUDE.md, 06 §7). Pure: (state, event) → state.
// - Deduped by seq: an event at or below `lastSeq` returns the same state object.
// - Gapless: an event past `lastSeq + 1` is rejected and reported in `problems`; the caller
//   repairs the gap from events.json and applies the missing events first.
// - Final: after run.completed / run.failed nothing is applied (reported as `after_terminal`).
// - Nothing here reads a clock. Times come from the events' `t_ms`.

import type {
  AgentInfo,
  AssayComputed,
  ClaimMarked,
  DebateRound,
  EvidenceObject,
  ExtractedClaim,
  Label,
  RunEvent,
  RunFailed,
  SignalComputed,
  SignalKind,
  VerdictFinal,
} from './types';

export type LaneState = 'queued' | 'working' | 'waiting' | 'done' | 'skipped' | 'failed';
export type RunStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface LaneNote {
  seq: number;
  text: string;
  source: 'model' | 'template';
  claimId?: string;
}

export interface Lane {
  id: string;
  name: string;
  role: string;
  group: string;
  model: string | null;
  fallbackModel: string | null;
  /** The model that actually served the latest call (agent.done.model). */
  servedBy: string | null;
  state: LaneState;
  round: number;
  startedAtMs: number | null;
  durationMs: number | null;
  action: { kind: string; label: string; detail?: string } | null;
  summary: string | null;
  counts: Record<string, number>;
  notes: LaneNote[];
  skipReason: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface Mark extends Omit<ClaimMarked, 'claim_id'> {
  seq: number;
  agent: string | null;
}

export interface ClaimStrip extends ExtractedClaim {
  seq: number;
  marks: Mark[];
}

export interface EvidenceCard extends EvidenceObject {
  seq: number;
  verification: { status: 'accepted' | 'rejected'; reason?: string | null } | null;
}

export interface Problem {
  seq: number;
  expected: number;
  reason: 'gap' | 'wrong_run' | 'unknown_agent' | 'after_terminal';
}

export interface RunState {
  runId: string | null;
  status: RunStatus;
  lastSeq: number;
  lastTMs: number;
  queuePosition: number | null;
  input: { type: 'text'; text: string } | null;
  pipelineMode: string | null;
  kb: { id: string; name: string } | null;
  promptVersion: string | null;
  agentOrder: string[];
  lanes: Record<string, Lane>;
  evidenceOrder: string[];
  evidence: Record<string, EvidenceCard>;
  claimOrder: string[];
  claims: Record<string, ClaimStrip>;
  signals: Partial<Record<SignalKind, SignalComputed & { seq: number }>>;
  debateRounds: (DebateRound & { seq: number })[];
  verdict: VerdictFinal | null;
  assay: AssayComputed | null;
  completed: { totalMs: number; cacheHit: boolean } | null;
  failure: RunFailed | null;
  /** Every applied event, in seq order (the Trace tab; export is events.json verbatim). */
  events: RunEvent[];
  problems: Problem[];
}

export function initialRunState(runId: string | null = null): RunState {
  return {
    runId,
    status: 'idle',
    lastSeq: 0,
    lastTMs: 0,
    queuePosition: null,
    input: null,
    pipelineMode: null,
    kb: null,
    promptVersion: null,
    agentOrder: [],
    lanes: {},
    evidenceOrder: [],
    evidence: {},
    claimOrder: [],
    claims: {},
    signals: {},
    debateRounds: [],
    verdict: null,
    assay: null,
    completed: null,
    failure: null,
    events: [],
    problems: [],
  };
}

function newLane(a: AgentInfo): Lane {
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    group: a.group,
    model: a.model ?? null,
    fallbackModel: a.fallback_model ?? null,
    servedBy: null,
    state: 'queued',
    round: 1,
    startedAtMs: null,
    durationMs: null,
    action: null,
    summary: null,
    counts: {},
    notes: [],
    skipReason: null,
    error: null,
  };
}

function withLane(state: RunState, id: string | null, update: (lane: Lane) => Lane): RunState {
  if (!id) return state;
  const lane = state.lanes[id];
  if (!lane) return state; // an agent that run.started didn't announce: ignore (reported below)
  return { ...state, lanes: { ...state.lanes, [id]: update(lane) } };
}

export function reduceRun(state: RunState, event: RunEvent): RunState {
  if (state.runId && event.run_id !== state.runId) {
    return { ...state, problems: [...state.problems, { seq: event.seq, expected: state.lastSeq + 1, reason: 'wrong_run' }] };
  }
  if (event.seq <= state.lastSeq) return state; // duplicate (replay, reconnect): idempotent
  if (state.status === 'completed' || state.status === 'failed') {
    // The log ended; nothing after a terminal event may change what the page shows.
    return { ...state, problems: [...state.problems, { seq: event.seq, expected: state.lastSeq, reason: 'after_terminal' }] };
  }
  if (event.seq !== state.lastSeq + 1) {
    return { ...state, problems: [...state.problems, { seq: event.seq, expected: state.lastSeq + 1, reason: 'gap' }] };
  }

  let s: RunState = {
    ...state,
    runId: state.runId ?? event.run_id,
    lastSeq: event.seq,
    lastTMs: Math.max(state.lastTMs, event.t_ms),
    events: [...state.events, event],
  };
  if (event.agent && s.agentOrder.length && !s.lanes[event.agent]) {
    s = { ...s, problems: [...s.problems, { seq: event.seq, expected: event.seq, reason: 'unknown_agent' }] };
  }

  switch (event.type) {
    case 'run.queued':
      return { ...s, status: 'queued', queuePosition: event.data.position };

    case 'run.started': {
      const d = event.data;
      const lanes: Record<string, Lane> = {};
      for (const a of d.agents) lanes[a.id] = newLane(a);
      return {
        ...s,
        status: 'running',
        queuePosition: null,
        input: d.input,
        pipelineMode: d.pipeline_mode ?? null,
        kb: d.kb ?? null,
        promptVersion: d.prompt_version ?? null,
        agentOrder: d.agents.map((a) => a.id),
        lanes,
      };
    }

    case 'agent.started': {
      const round = event.data.round ?? 1;
      return withLane(s, event.agent, (l) => ({
        ...l,
        state: 'working',
        round,
        startedAtMs: event.t_ms,
        durationMs: null,
        action: null,
        summary: round > 1 ? null : l.summary,
        error: null,
      }));
    }

    case 'agent.action':
      return withLane(s, event.agent, (l) => ({
        ...l,
        action: {
          kind: event.data.action,
          label: event.data.label,
          ...(event.data.detail ? { detail: event.data.detail } : {}),
        },
      }));

    case 'agent.note':
      return withLane(s, event.agent, (l) => ({
        ...l,
        notes: [
          ...l.notes,
          {
            seq: event.seq,
            text: event.data.note,
            source: event.data.source ?? 'template',
            ...(event.data.claim_id ? { claimId: event.data.claim_id } : {}),
          },
        ],
      }));

    case 'agent.done':
      return withLane(s, event.agent, (l) => ({
        ...l,
        state: 'done',
        durationMs: event.data.duration_ms,
        summary: event.data.summary,
        counts: event.data.counts ?? {},
        servedBy: event.data.model ?? l.servedBy,
      }));

    case 'agent.skipped':
      return withLane(s, event.agent, (l) => ({ ...l, state: 'skipped', skipReason: event.data.reason }));

    case 'agent.failed':
      return withLane(s, event.agent, (l) => ({
        ...l,
        state: 'failed',
        error: { code: event.data.error_code, message: event.data.message, retryable: event.data.retryable },
      }));

    case 'evidence.found': {
      const ev = event.data.evidence;
      if (s.evidence[ev.evidence_id]) return s;
      return {
        ...s,
        evidenceOrder: [...s.evidenceOrder, ev.evidence_id],
        evidence: { ...s.evidence, [ev.evidence_id]: { ...ev, seq: event.seq, verification: null } },
      };
    }

    case 'evidence.verified': {
      const card = s.evidence[event.data.evidence_id];
      if (!card) return s;
      return {
        ...s,
        evidence: {
          ...s.evidence,
          [card.evidence_id]: {
            ...card,
            verifier_status: event.data.status,
            verification: { status: event.data.status, reason: event.data.reason ?? null },
          },
        },
      };
    }

    case 'claim.extracted': {
      const c = event.data.claim;
      if (s.claims[c.claim_id]) return s;
      return {
        ...s,
        claimOrder: [...s.claimOrder, c.claim_id],
        claims: { ...s.claims, [c.claim_id]: { ...c, seq: event.seq, marks: [] } },
      };
    }

    case 'claim.marked': {
      const { claim_id, ...mark } = event.data;
      const strip = s.claims[claim_id];
      if (!strip) return s;
      return {
        ...s,
        claims: {
          ...s.claims,
          [claim_id]: { ...strip, marks: [...strip.marks, { ...mark, seq: event.seq, agent: event.agent }] },
        },
      };
    }

    case 'signal.computed':
      return { ...s, signals: { ...s.signals, [event.data.signal]: { ...event.data, seq: event.seq } } };

    case 'debate.round': {
      const next = withLane(s, event.agent ?? 'judge', (l) => ({ ...l, state: 'waiting', action: null }));
      return { ...next, debateRounds: [...next.debateRounds, { ...event.data, seq: event.seq }] };
    }

    case 'verdict.final':
      return { ...s, verdict: event.data };

    case 'assay.computed':
      return { ...s, assay: event.data };

    case 'run.completed':
      return {
        ...s,
        status: 'completed',
        completed: { totalMs: event.data.total_ms, cacheHit: event.data.cache_hit ?? false },
      };

    case 'run.failed':
      // The last good state stays visible; there is never a verdict on a failed run.
      // Lanes still working or waiting when the run died end as failed (06 §4.1).
      return {
        ...s,
        status: 'failed',
        failure: event.data,
        verdict: null,
        assay: null,
        lanes: Object.fromEntries(
          Object.entries(s.lanes).map(([id, l]) => [
            id,
            l.state === 'working' || l.state === 'waiting'
              ? {
                  ...l,
                  state: 'failed' as const,
                  error: l.error ?? { code: event.data.error_code, message: event.data.message, retryable: event.data.retryable },
                }
              : l,
          ]),
        ),
      };
  }
}

/** Fold a whole log (fixtures, events.json, replay). */
export function reduceAll(events: readonly RunEvent[], state: RunState = initialRunState()): RunState {
  return events.reduce(reduceRun, state);
}

// ── Selectors (components read slices, never the raw log) ───────────────────

export function lanes(state: RunState): Lane[] {
  return state.agentOrder.map((id) => state.lanes[id]).filter(Boolean);
}

export function isFinished(state: RunState): boolean {
  return state.status === 'completed' || state.status === 'failed';
}

export function claimLabel(state: RunState, claimId: string): Label | null {
  return state.verdict?.claims.find((c) => c.claim_id === claimId)?.label ?? null;
}

export function laneCounts(state: RunState): Record<LaneState, number> {
  const out: Record<LaneState, number> = { queued: 0, working: 0, waiting: 0, done: 0, skipped: 0, failed: 0 };
  for (const l of lanes(state)) out[l.state] += 1;
  return out;
}

export interface LaneGroup {
  group: string;
  /** More than one agent shares the group, so they run side by side (S3.3). */
  parallel: boolean;
  lanes: Lane[];
}

/** Lanes in server order, with neighbours that share a `group` gathered together. */
export function laneGroups(state: RunState): LaneGroup[] {
  const out: LaneGroup[] = [];
  for (const lane of lanes(state)) {
    const last = out[out.length - 1];
    if (last && last.group === lane.group) last.lanes.push(lane);
    else out.push({ group: lane.group, parallel: false, lanes: [lane] });
  }
  for (const g of out) g.parallel = g.lanes.length > 1;
  return out;
}

/** The lane whose work the page should name right now: the latest to start among those working. */
export function currentLane(state: RunState): Lane | null {
  const working = lanes(state).filter((l) => l.state === 'working' || l.state === 'waiting');
  if (!working.length) return null;
  return working.reduce((a, b) => ((b.startedAtMs ?? 0) >= (a.startedAtMs ?? 0) ? b : a));
}

/** At most this many glyphs boil at once (05 §3.2). */
export const BOIL_BUDGET = 3;

/**
 * The working lanes whose glyph boils: the most recently started ones, at most BOIL_BUDGET (05 §3.2). Ties keep server
 * order. Only while the run is running and its events are arriving (`live`: the caller knows the connection); a lane
 * left `working` by a lost connection or a log without its agent.done shows no motion that no event backs.
 */
export function boilingLanes(state: RunState, live = true): Set<string> {
  if (!live || state.status !== 'running') return new Set();
  const working = lanes(state)
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.state === 'working')
    .sort((a, b) => (b.l.startedAtMs ?? 0) - (a.l.startedAtMs ?? 0) || a.i - b.i);
  return new Set(working.slice(0, BOIL_BUDGET).map(({ l }) => l.id));
}

/** The wording checks each agent has finished, in arrival order (one tally stroke each, 05 §3.4). */
export function laneSignals(state: RunState): Record<string, SignalKind[]> {
  const out: Record<string, SignalKind[]> = {};
  for (const e of state.events) {
    if (e.type !== 'signal.computed' || !e.agent) continue;
    const list = (out[e.agent] ??= []);
    if (!list.includes(e.data.signal)) list.push(e.data.signal);
  }
  return out;
}

/** The input's spans the wording checks flagged (loaded words, absolutes), merged where they overlap. */
export function flaggedSpans(state: RunState): { span: [number, number]; seq: number }[] {
  const all = Object.values(state.signals)
    .flatMap((s) => (s?.spans ?? []).map((span) => ({ span: [span[0], span[1]] as [number, number], seq: s!.seq })))
    .filter(({ span }) => Number.isFinite(span[0]) && Number.isFinite(span[1]) && span[1] > span[0])
    .sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
  const out: { span: [number, number]; seq: number }[] = [];
  for (const cur of all) {
    const prev = out[out.length - 1];
    if (prev && cur.span[0] <= prev.span[1]) {
      prev.span[1] = Math.max(prev.span[1], cur.span[1]);
      prev.seq = Math.min(prev.seq, cur.seq);
    } else out.push({ span: [...cur.span], seq: cur.seq });
  }
  return out;
}

/** How many agents have been handed the case so far ("step N" in the interrupted banner). */
export function stepsReached(state: RunState): number {
  return lanes(state).filter((l) => l.state !== 'queued' && l.state !== 'skipped').length;
}

/** Strips in reading order: by where they sit in the message, then by arrival. */
export function orderedClaims(state: RunState): ClaimStrip[] {
  return state.claimOrder
    .map((id) => state.claims[id])
    .filter(Boolean)
    .sort((a, b) => a.source_span[0] - b.source_span[0] || a.seq - b.seq);
}

/** "Part n" numbers as the reader sees them (reading order, from 1). */
export function partNumbers(state: RunState): Record<string, number> {
  return Object.fromEntries(orderedClaims(state).map((c, i) => [c.claim_id, i + 1]));
}

export interface StripEvidence {
  /** Logged evidence ids tied to this part, in tray order. */
  ids: string[];
  /** Of those, the ones a mark or the verdict says contradict it. */
  disagree: number;
}

/**
 * The sources tied to one part, only from what the log says: the evidence ids on its marks and
 * the Judge's evidence_for / evidence_against. Ids not in the log are ignored.
 */
export function stripEvidence(state: RunState, claimId: string): StripEvidence {
  const strip = state.claims[claimId];
  const verdict = state.verdict?.claims.find((c) => c.claim_id === claimId);
  const tied = new Set<string>();
  const against = new Set<string>();
  for (const m of strip?.marks ?? []) {
    for (const id of m.evidence_ids ?? []) {
      tied.add(id);
      if (m.relation === 'contradicts') against.add(id);
    }
  }
  for (const id of verdict?.evidence_for ?? []) tied.add(id);
  for (const id of verdict?.evidence_against ?? []) {
    tied.add(id);
    against.add(id);
  }
  const ids = state.evidenceOrder.filter((id) => tied.has(id));
  return { ids, disagree: ids.filter((id) => against.has(id)).length };
}

export interface EvidenceUse {
  claimId: string;
  part: number;
  relation: 'supports' | 'contradicts' | 'missing_context' | 'framing' | 'unclear';
}

/**
 * What the log says a source was used for ("Contradicts part 2"). Marks come first; the Judge's
 * evidence_for / evidence_against add uses the marks didn't state. Nothing is inferred.
 */
export function evidenceUses(state: RunState, evidenceId: string): EvidenceUse[] {
  const parts = partNumbers(state);
  const out: EvidenceUse[] = [];
  const seen = new Set<string>();
  const add = (claimId: string, relation: EvidenceUse['relation']) => {
    const key = `${claimId}:${relation}`;
    if (seen.has(key) || parts[claimId] == null) return;
    seen.add(key);
    out.push({ claimId, part: parts[claimId], relation });
  };
  for (const c of orderedClaims(state)) {
    for (const m of c.marks) if (m.evidence_ids?.includes(evidenceId)) add(c.claim_id, m.relation);
  }
  for (const v of state.verdict?.claims ?? []) {
    if (v.evidence_for?.includes(evidenceId)) add(v.claim_id, 'supports');
    if (v.evidence_against?.includes(evidenceId)) add(v.claim_id, 'contradicts');
  }
  return out.sort((a, b) => a.part - b.part);
}

/** The latest debate.round reason (the Judge's "second round" line). */
export function debateReason(state: RunState): string | null {
  return state.debateRounds[state.debateRounds.length - 1]?.reason ?? null;
}

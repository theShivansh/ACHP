// The only place run state changes (CLAUDE.md, 06 §7). Pure: (state, event) → state.
// - Deduped by seq: an event at or below `lastSeq` returns the same state object.
// - Gapless: an event past `lastSeq + 1` is rejected and reported in `problems`; the caller
//   repairs the gap from events.json and applies the missing events first.
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
  reason: 'gap' | 'wrong_run' | 'unknown_agent';
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
      return { ...s, status: 'failed', failure: event.data, verdict: null, assay: null };
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

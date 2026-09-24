// Event protocol v2 (docs/upgrade/06_AGENT_STATE_SPEC.md §3). Hand-kept mirror of the schema of
// record, apps/api/schemas/events.v2.json; `types.sync.test.ts` fails if the two drift.

export const EVENT_TYPES = [
  'run.queued',
  'run.started',
  'agent.started',
  'agent.action',
  'agent.note',
  'agent.done',
  'agent.skipped',
  'agent.failed',
  'evidence.found',
  'evidence.verified',
  'claim.extracted',
  'claim.marked',
  'signal.computed',
  'debate.round',
  'verdict.final',
  'assay.computed',
  'run.completed',
  'run.failed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const TERMINAL_TYPES = ['run.completed', 'run.failed'] as const satisfies readonly EventType[];

export const LABELS = ['supported', 'contradicted', 'mixed', 'missing_context', 'unverifiable', 'blocked'] as const;
export type Label = (typeof LABELS)[number];

export const BANDS = ['strong', 'moderate', 'weak'] as const;
export type Band = (typeof BANDS)[number];

export const RELATIONS = ['contradicts', 'supports', 'missing_context', 'framing', 'unclear'] as const;
export type Relation = (typeof RELATIONS)[number];

export const ACTIONS = ['search_web', 'search_kb', 'fetch_source', 'llm_call', 'compute', 'validate'] as const;
export type ActionKind = (typeof ACTIONS)[number];

export const SIGNALS = ['sentiment', 'bias', 'perspective', 'framing', 'hedging'] as const;
export type SignalKind = (typeof SIGNALS)[number];

export type Span = [number, number];

// ── Payloads ────────────────────────────────────────────────────────────────

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  model?: string | null;
  fallback_model?: string | null;
  group: string;
}

export interface RunQueued {
  position: number;
}
export interface RunStarted {
  input: { type: 'text'; text: string };
  agents: AgentInfo[];
  pipeline_mode?: string | null;
  kb?: { id: string; name: string } | null;
  prompt_version?: string | null;
}
export interface RunCompleted {
  total_ms: number;
  cache_hit?: boolean;
}
export interface RunFailed {
  stage: string;
  error_code: string;
  message: string;
  retryable: boolean;
}
export interface AgentStarted {
  step: number;
  group?: string | null;
  round?: number | null;
}
export interface AgentAction {
  action: ActionKind;
  label: string;
  detail?: string | null;
  claim_id?: string | null;
}
export interface AgentNote {
  note: string;
  claim_id?: string | null;
  source?: 'model' | 'template';
}
export interface AgentDone {
  duration_ms: number;
  summary: string;
  counts?: Record<string, number>;
  model?: string | null;
}
export interface AgentSkipped {
  reason: string;
}
export interface AgentFailed {
  error_code: string;
  message: string;
  retryable: boolean;
}
export interface EvidenceObject {
  evidence_id: string;
  claim_id?: string | null;
  source: {
    source_id: string;
    kind: 'web' | 'kb' | 'context';
    url?: string | null;
    domain?: string | null;
    title?: string | null;
    published_at?: string | null;
  };
  locator: string;
  quote: string;
  relation?: Relation | null;
  strength?: number | null;
  freshness?: number | null;
  verifier_status?: 'pending' | 'accepted' | 'rejected';
  retrieved_at?: string | null;
}
export interface EvidenceFound {
  evidence: EvidenceObject;
}
export interface EvidenceVerified {
  evidence_id: string;
  status: 'accepted' | 'rejected';
  reason?: string | null;
}
export interface ExtractedClaim {
  claim_id: string;
  text: string;
  source_span: Span;
  verifiable: boolean;
  epistemic_marker: string;
}
export interface ClaimExtracted {
  claim: ExtractedClaim;
}
export interface ClaimMarked {
  claim_id: string;
  relation: Relation;
  span: Span;
  severity?: number | null;
  evidence_ids?: string[];
  note?: string | null;
}
export interface SignalComputed {
  signal: SignalKind;
  label: string;
  value?: number | null;
  spans?: Span[];
  explanation?: string | null;
}
export interface DebateRound {
  round: number;
  reason: string;
}
export interface Metrics {
  CTS: number;
  PCS: number;
  BIS: number;
  NSS: number;
  EPS: number;
}
export interface ClaimVerdict {
  claim_id: string;
  label: Label;
  confidence_band: Band;
  confidence_reason?: string | null;
  evidence_for?: string[];
  evidence_against?: string[];
  missing_context?: string | null;
}
export interface VerdictFinal {
  overall: {
    label: Label;
    summary: string;
    confidence_band: Band;
    confidence_reason: string;
    judge_verdict?: string | null;
  };
  claims: ClaimVerdict[];
  metrics?: Metrics | null;
}
export interface AssayComputed {
  formula_version: string;
  mode: 'code';
  signals: Record<string, unknown>;
  metrics: Metrics;
  composite: number;
  formula_verdict: string;
  judge_verdict: string;
  two_key: Record<string, unknown>;
  ledger: Record<string, unknown>;
  tipping_point: Record<string, unknown>;
  masking: Record<string, unknown>;
  integrity_map: Record<string, unknown>;
}

export interface PayloadMap {
  'run.queued': RunQueued;
  'run.started': RunStarted;
  'agent.started': AgentStarted;
  'agent.action': AgentAction;
  'agent.note': AgentNote;
  'agent.done': AgentDone;
  'agent.skipped': AgentSkipped;
  'agent.failed': AgentFailed;
  'evidence.found': EvidenceFound;
  'evidence.verified': EvidenceVerified;
  'claim.extracted': ClaimExtracted;
  'claim.marked': ClaimMarked;
  'signal.computed': SignalComputed;
  'debate.round': DebateRound;
  'verdict.final': VerdictFinal;
  'assay.computed': AssayComputed;
  'run.completed': RunCompleted;
  'run.failed': RunFailed;
}

/** The envelope (06 §3). `seq` is gapless per run from 1; `t_ms` counts from run.started. */
export type RunEvent = {
  [T in EventType]: {
    v: 2;
    run_id: string;
    seq: number;
    ts: string;
    t_ms: number;
    type: T;
    agent: string | null;
    data: PayloadMap[T];
  };
}[EventType];

export type EventOf<T extends EventType> = Extract<RunEvent, { type: T }>;

/** Required payload fields per type, compared with the JSON Schema by the sync test. */
export const REQUIRED_FIELDS: Record<EventType, readonly string[]> = {
  'run.queued': ['position'],
  'run.started': ['input', 'agents'],
  'agent.started': ['step'],
  'agent.action': ['action', 'label'],
  'agent.note': ['note'],
  'agent.done': ['duration_ms', 'summary'],
  'agent.skipped': ['reason'],
  'agent.failed': ['error_code', 'message', 'retryable'],
  'evidence.found': ['evidence'],
  'evidence.verified': ['evidence_id', 'status'],
  'claim.extracted': ['claim'],
  'claim.marked': ['claim_id', 'relation', 'span'],
  'signal.computed': ['signal', 'label'],
  'debate.round': ['round', 'reason'],
  'verdict.final': ['overall', 'claims'],
  'assay.computed': [
    'formula_version',
    'mode',
    'signals',
    'metrics',
    'composite',
    'formula_verdict',
    'judge_verdict',
    'two_key',
    'ledger',
    'tipping_point',
    'masking',
    'integrity_map',
  ],
  'run.completed': ['total_ms'],
  'run.failed': ['stage', 'error_code', 'message', 'retryable'],
};

export function isTerminal(e: Pick<RunEvent, 'type'>): boolean {
  return (TERMINAL_TYPES as readonly string[]).includes(e.type);
}

/** Minimal structural check for a parsed SSE/JSON frame. The server validates payloads; the
 * client only refuses frames that aren't v2 envelopes. */
export function isRunEvent(x: unknown): x is RunEvent {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    e.v === 2 &&
    typeof e.run_id === 'string' &&
    typeof e.seq === 'number' &&
    Number.isInteger(e.seq) &&
    e.seq >= 1 &&
    typeof e.type === 'string' &&
    (EVENT_TYPES as readonly string[]).includes(e.type) &&
    typeof e.data === 'object' &&
    e.data !== null
  );
}

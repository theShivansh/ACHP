// ACHP Shared TypeScript types
// Used by API routes, components, and server actions

export interface ACHPMetrics {
  CTS: number;   // Consensus Truth Score
  PCS: number;   // Perspective Completeness Score
  BIS: number;   // Bias Impact Score (lower = better)
  NSS: number;   // Narrative Stance Score
  EPS: number;   // Epistemic Position Score
}

export interface AtomicClaim {
  id: string;
  text: string;
  verifiable: boolean;
  confidence: number;
  epistemic_marker: string;
  citations: string[];      // raw citation strings
  source_url?: string;      // exact web URL used as evidence (if web search)
  kb_page?: number;         // KB chunk / page index (if KB was used)
  kb_name?: string;         // friendly KB name
}

export interface NILResult {
  verdict: string;
  confidence: number;
  summary: string;
  BIS: number;
  EPS: number;
  PCS: number;
}

export interface MissingPerspective {
  stakeholder: string;
  viewpoint: string;
  significance: number;
}

export interface AdversaryAReport {
  factual_score: number;
  critical_flaws: string[];
  verdict: string;
}

export interface AdversaryBReport {
  perspective_score: number;
  missing_perspectives: MissingPerspective[];
  narrative_stance: string;
}

export interface KeyEvidence {
  supporting: string[];
  contradicting: string[];
}

export interface PipelineInfo {
  mode: string;
  latency_ms: Record<string, number>;
  total_ms: number;
  models: Record<string, string>;
  cache_hit: boolean;
}

export interface SecurityInfo {
  pre_safe: boolean;
  post_safe: boolean;
  warnings: string[];
}

export type Verdict =
  | 'TRUE'
  | 'MOSTLY_TRUE'
  | 'MIXED'
  | 'MOSTLY_FALSE'
  | 'FALSE'
  | 'UNVERIFIABLE'
  | 'BLOCKED';

export interface ACHPOutput {
  run_id: string;
  timestamp: string;
  input: string;
  verdict: Verdict;
  verdict_confidence: number;
  composite_score: number;
  metrics: ACHPMetrics;
  nil: NILResult;
  atomic_claims: AtomicClaim[];
  adversary_a: AdversaryAReport;
  adversary_b: AdversaryBReport;
  consensus_reasoning: string;
  key_evidence: KeyEvidence;
  caveats: string[];
  debate_rounds: number;
  pipeline: PipelineInfo;
  security: SecurityInfo;
}

// Agent status events from SSE stream
export interface AgentEvent {
  event: 'agent_status' | 'pipeline_complete' | 'error';
  data: Record<string, unknown>;
  ts: number;
}

export interface AgentStatus {
  id: string;
  label: string;
  icon: string;
  status: 'idle' | 'running' | 'done' | 'error';
  detail?: string;
}

// Demo queries for quick-fill
export const DEMO_QUERIES = [
  {
    id: 'climate',
    label: 'Climate Hoax Claim',
    text: 'Climate change is a hoax created by the Chinese government to make U.S. manufacturing non-competitive.',
    expectedVerdict: 'FALSE',
  },
  {
    id: 'exercise',
    label: 'Exercise & Heart Health',
    text: 'Regular exercise reduces the risk of cardiovascular disease by approximately 30 to 40 percent.',
    expectedVerdict: 'MOSTLY_TRUE',
  },
  {
    id: 'immigration',
    label: 'Immigration Economy Claim',
    text: 'Immigrants are destroying our economy and taking all the jobs from hard-working citizens.',
    expectedVerdict: 'MOSTLY_FALSE',
  },
] as const;

// ── NotebookLM-style RAG Q&A types ────────────────────────────────────────────
export interface QACitation {
  chunk_index: number;
  excerpt:     string;
  score:       number;
}

export interface QAResponse {
  run_id:     string;
  question:   string;
  answer:     string;    // grounded answer with [N] inline citation markers
  citations:  QACitation[];
  kb_id:      string;
  kb_name:    string;
  latency_ms: number;
}

// The shapes of POST /qa (apps/api/main.py: QARequest, QACitation, QAResponse).

export interface QACitation {
  chunk_index: number;
  excerpt: string;
  score: number;
}

export interface QAResponse {
  run_id: string;
  question: string;
  /** The grounded answer with [N] inline citation markers, written by the server. */
  answer: string;
  citations: QACitation[];
  kb_id: string;
  kb_name: string;
  latency_ms: number;
}

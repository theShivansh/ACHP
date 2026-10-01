// Grounded Q&A against a library (07 §6): the client side of POST /qa. The server drops any sentence that cites no
// retrieved chunk and writes the [N] markers itself, so every marker here points at a passage the reader can open.
// Nothing here writes an answer: it only splits the server's text at its markers.

import type { QACitation, QAResponse } from '@/lib/types';

const API = () => (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

export class QAError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function askLibrary(question: string, kbId: string, topK = 6, base = API()): Promise<QAResponse> {
  let r: Response;
  try {
    r = await fetch(`${base}/qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, kb_id: kbId, top_k: topK }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new QAError('The library could not be reached. Check that the desk is awake and try again.', 0);
  }
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { detail?: unknown } | null;
    const d = typeof body?.detail === 'string' ? body.detail : '';
    if (r.status === 404) throw new QAError('That library no longer exists. Choose another.', 404);
    if (r.status === 409) throw new QAError('That library is still being indexed. Try again when it says Ready.', 409);
    throw new QAError(d || `The library answered ${r.status}.`, r.status);
  }
  return (await r.json()) as QAResponse;
}

/** "close match" · "partial match" · "loose match": the similarity in words (the number stays in the tooltip). */
export function matchWords(score: number): string {
  if (score >= 0.55) return 'close match';
  if (score >= 0.35) return 'partial match';
  return 'loose match';
}

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'cite'; chunk: number };

const MARKER = /\[(?:CHUNK\s*)?(\d+)\]/gi;

/** The answer split at its [N] markers, in order. */
export function splitAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of answer.matchAll(MARKER)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: answer.slice(last, at) });
    parts.push({ kind: 'cite', chunk: Number(m[1]) });
    last = at + m[0].length;
  }
  if (last < answer.length) parts.push({ kind: 'text', text: answer.slice(last) });
  return parts;
}

/** The chunks the answer cites, in the order they first appear (this order numbers the chips 1, 2, 3…). */
export function citedChunks(answer: string): number[] {
  return [...new Set(splitAnswer(answer).flatMap((p) => (p.kind === 'cite' ? [p.chunk] : [])))];
}

/**
 * True when the library had nothing to say: no sentence carries a citation (the server returns "The knowledge base does
 * not contain information about this." and no cited passage). The nearest passages are then shown for what they are.
 */
export function isOutOfLibrary(res: Pick<QAResponse, 'answer'>): boolean {
  return citedChunks(res.answer).length === 0;
}

/** The passages to show: the cited ones in the order they are cited, then the rest by closeness. */
export function orderedCitations(res: Pick<QAResponse, 'answer' | 'citations'>): { cited: QACitation[]; other: QACitation[] } {
  const order = citedChunks(res.answer);
  const byIndex = new Map(res.citations.map((c) => [c.chunk_index, c]));
  const cited = order.flatMap((i) => (byIndex.has(i) ? [byIndex.get(i)!] : []));
  const other = res.citations.filter((c) => !order.includes(c.chunk_index)).sort((a, b) => b.score - a.score);
  return { cited, other };
}

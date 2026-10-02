// HTTP calls for the runs protocol (06 §2). The backend URL is public config; no secrets here.

import { apiBase } from '../apiUrl';
import { isRunEvent, type RunEvent } from './types';

export { apiBase } from '../apiUrl';

export interface RunCreated {
  run_id: string;
  events_url: string;
  case_url: string;
}

export interface RunSnapshot {
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  created_at: string;
  input: { type: 'text'; text: string; kb_id?: string };
  last_seq: number;
  result?: Record<string, unknown>;
  error?: { stage: string; error_code: string; message: string; retryable: boolean };
}

export class RunRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function detail(r: Response): Promise<string> {
  const body = (await r.json().catch(() => null)) as { detail?: unknown } | null;
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return 'The message could not be checked. Please check its length.';
  return `The checker answered ${r.status}.`;
}

export async function startRun(text: string, kbId?: string, base = apiBase()): Promise<RunCreated> {
  const r = await fetch(`${base}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { type: 'text', text }, ...(kbId ? { kb_id: kbId } : {}) }),
  });
  if (r.status !== 202) throw new RunRequestError(await detail(r), r.status);
  return (await r.json()) as RunCreated;
}

export async function fetchRun(runId: string, base = apiBase()): Promise<RunSnapshot> {
  const r = await fetch(`${base}/runs/${encodeURIComponent(runId)}`);
  if (!r.ok) throw new RunRequestError(await detail(r), r.status);
  return (await r.json()) as RunSnapshot;
}

export async function fetchEvents(
  runId: string,
  since = 0,
  base = apiBase(),
  fetchImpl: typeof fetch = fetch,
): Promise<RunEvent[]> {
  const r = await fetchImpl(`${base}/runs/${encodeURIComponent(runId)}/events.json?since=${since}`);
  if (!r.ok) throw new RunRequestError(await detail(r), r.status);
  const body = (await r.json()) as { events?: unknown[] };
  return (body.events ?? []).filter(isRunEvent);
}

/** The Trace export: events.json exactly as the server sent it. */
export async function fetchEventsJsonText(runId: string, base = apiBase()): Promise<string> {
  const r = await fetch(`${base}/runs/${encodeURIComponent(runId)}/events.json`);
  if (!r.ok) throw new RunRequestError(await detail(r), r.status);
  return r.text();
}

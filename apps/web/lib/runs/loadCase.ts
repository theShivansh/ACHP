// Server-side load of one case's stored log, shared by the page, its metadata and its OG image
// (06 §7 SSR). `cache` de-duplicates the fetch within a request. Server code only.

import { cache } from 'react';
import { apiBase } from './api';
import { fixtureEnabled, isSampleId, readFixture, readSample } from './fixtures';
import { initialRunState, reduceAll, type RunState } from './reducer';
import { isRunEvent, type RunEvent } from './types';

export const FIXTURE_PREFIX = 'fixture-';
export const RUN_ID = /^[A-Za-z0-9_-]{4,64}$/;

export interface LoadedCase {
  events: RunEvent[];
  /** The backend says the run doesn't exist (expired or never stored). */
  expired: boolean;
  fixture: string | null;
  /** A recorded example that ships with the app (served in production, unlike a fixture). */
  sample: boolean;
  state: RunState;
}

async function fetchStored(runId: string): Promise<{ events: RunEvent[]; expired: boolean }> {
  try {
    const r = await fetch(`${apiBase()}/runs/${encodeURIComponent(runId)}/events.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (r.status === 404) return { events: [], expired: true };
    if (!r.ok) return { events: [], expired: false };
    const body = (await r.json()) as { events?: unknown[] };
    return { events: (body.events ?? []).filter(isRunEvent), expired: false };
  } catch {
    // An unreachable backend just means the client connects on its own (and shows "waking").
    return { events: [], expired: false };
  }
}

export const loadCase = cache(async (id: string): Promise<LoadedCase | null> => {
  if (id.startsWith(FIXTURE_PREFIX)) {
    if (!fixtureEnabled()) return null;
    const name = id.slice(FIXTURE_PREFIX.length);
    const events = readFixture(name);
    return events ? { events, expired: false, fixture: name, sample: false, state: reduceAll(events) } : null;
  }
  if (isSampleId(id)) {
    const events = readSample(id);
    return events ? { events, expired: false, fixture: null, sample: true, state: reduceAll(events) } : null;
  }
  if (!RUN_ID.test(id)) return null;
  const { events, expired } = await fetchStored(id);
  return { events, expired, fixture: null, sample: false, state: events.length ? reduceAll(events) : initialRunState(id) };
});

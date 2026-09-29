import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { CaseLive } from '@/components/case/CaseLive';
import { apiBase } from '@/lib/runs/api';
import { fixtureEnabled, parseReplayOptions, readFixture, replayOptionsSegment } from '@/lib/runs/fixtures';
import { isRunEvent, type RunEvent } from '@/lib/runs/types';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUN_ID = /^[A-Za-z0-9_-]{4,64}$/;
const FIXTURE_PREFIX = 'fixture-';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Case ${id} · ACHP` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The stored log so far, for a fast first paint of a run that already has events (06 §7 SSR).
 * `expired` when the backend says the run doesn't exist; an unreachable backend just means the
 * client connects on its own (and shows "waking" while /health is pending).
 */
async function storedEvents(runId: string): Promise<{ events: RunEvent[]; expired: boolean }> {
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
    return { events: [], expired: false };
  }
}

/** The repo's EVALUATION.md, if it exists (audit 01 G5: the benchmark is read, never written here). */
function readBenchmark(): string | null {
  try {
    const raw = readFileSync(path.resolve(process.cwd(), '..', '..', 'EVALUATION.md'), 'utf8').trim();
    if (!raw) return null;
    const firstParagraph = raw.replace(/^#[^\n]*\n+/, '').split(/\n{2,}/)[0];
    return firstParagraph.slice(0, 600);
  } catch {
    return null;
  }
}

export default async function CasePage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  if (id.startsWith(FIXTURE_PREFIX)) {
    // Dev/test replay of a recorded log (P3). Never served in production.
    if (!fixtureEnabled()) notFound();
    const name = id.slice(FIXTURE_PREFIX.length);
    const events = readFixture(name);
    if (!events) notFound();
    const opts = parseReplayOptions(
      [one(sp.speed) && `speed=${one(sp.speed)}`, one(sp.drop) && `drop=${one(sp.drop)}`].filter(Boolean).join(','),
    );
    return (
      <CaseLive
        key={`${name}:${opts.speed}:${opts.drop}`}
        runId={events[0].run_id}
        baseUrl={`/api/dev/fixture/${name}/${replayOptionsSegment(opts)}`}
        fixture={{ name, speed: opts.speed }}
        benchmark={readBenchmark()}
      />
    );
  }

  if (!RUN_ID.test(id)) notFound();
  const { events, expired } = await storedEvents(id);
  return <CaseLive key={id} runId={id} initialEvents={events} expired={expired} benchmark={readBenchmark()} />;
}

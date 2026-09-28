// Dev/test only (404 in production): replays a fixture log through the same endpoints the backend
// serves (06 §2), so RunConnection and the case page run unchanged against it.
//
//   /api/dev/fixture/<name>[/<opts>]                       SSE of the whole log
//   /api/dev/fixture/<name>/<opts>/runs/<id>/events        SSE, resumable (?since= or Last-Event-ID)
//   /api/dev/fixture/<name>/<opts>/runs/<id>/events.json   {run_id, events} after ?since=
//   /api/dev/fixture/<name>/<opts>/runs/<id>               snapshot
//
// Events go out at their recorded timing (t_ms), divided by `speed`. Nothing is invented: the
// stream is the file, byte for byte in content, only paced.

import { fixtureEnabled, parseReplayOptions, readFixture } from '@/lib/runs/fixtures';
import type { RunEvent } from '@/lib/runs/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ name: string; path?: string[] }> };

const PING_MS = 10_000;

function notFound(detail = 'Not found') {
  return Response.json({ detail }, { status: 404 });
}

function frame(e: RunEvent): string {
  return `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

function sinceOf(req: Request): number {
  const q = Number(new URL(req.url).searchParams.get('since') ?? 0);
  const h = Number(req.headers.get('last-event-id') ?? 0);
  return Math.max(Number.isFinite(q) ? q : 0, Number.isFinite(h) ? h : 0, 0);
}

function stream(req: Request, events: RunEvent[], since: number, speed: number, drop: number | null): Response {
  const encoder = new TextEncoder();
  const rest = events.filter((e) => e.seq > since);
  const base = events.find((e) => e.seq === since)?.t_ms ?? 0;
  const dropAt = drop != null && since < drop ? drop : null;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const t0 = Date.now();
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms);
          req.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      for (const e of rest) {
        // Pace to the recorded offset; keep the connection visibly alive through long gaps.
        for (;;) {
          if (req.signal.aborted) break;
          const due = (e.t_ms - base) / speed - (Date.now() - t0);
          if (due <= 0) break;
          await wait(Math.min(due, PING_MS));
          if (due > PING_MS) send(': ping\nevent: ping\ndata: {}\n\n');
        }
        if (req.signal.aborted) break;
        send(frame(e));
        if (dropAt != null && e.seq >= dropAt) break; // test hook: the connection drops here
      }
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function GET(req: Request, { params }: Ctx) {
  if (!fixtureEnabled()) return notFound();
  const { name, path = [] } = await params;
  const events = readFixture(name);
  if (!events) return notFound('No such fixture');

  const hasOpts = path[0]?.includes('=') ?? false;
  const opts = parseReplayOptions(hasOpts ? path[0] : undefined);
  const rest = hasOpts ? path.slice(1) : path;
  const runId = events[0].run_id;

  if (rest.length === 0) return stream(req, events, sinceOf(req), opts.speed, opts.drop);
  if (rest[0] !== 'runs' || rest[1] !== runId) return notFound('Run not found');

  const tail = rest.slice(2).join('/');
  if (tail === 'events') return stream(req, events, sinceOf(req), opts.speed, opts.drop);
  if (tail === 'events.json') {
    const since = sinceOf(req);
    return Response.json({ run_id: runId, events: events.filter((e) => e.seq > since) });
  }
  if (tail === '') {
    const last = events[events.length - 1];
    const started = events.find((e) => e.type === 'run.started');
    return Response.json({
      run_id: runId,
      status: last.type === 'run.completed' ? 'completed' : last.type === 'run.failed' ? 'failed' : 'running',
      created_at: events[0].ts,
      input: started?.type === 'run.started' ? started.data.input : { type: 'text', text: '' },
      last_seq: last.seq,
    });
  }
  return notFound();
}

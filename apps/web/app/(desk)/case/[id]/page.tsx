import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { CaseLive } from '@/components/case/CaseLive';
import { ReplayStory } from '@/components/story/ReplayStory';
import { parseReplayOptions, replayOptionsSegment } from '@/lib/runs/fixtures';
import { FIXTURE_PREFIX, loadCase } from '@/lib/runs/loadCase';
import { excerpt, verdictInfo } from '@/lib/verdict';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "ACHP · Contradicted: The Great Wall of China is visible from the Moon…" (S6.x). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadCase(id);
  const label = loaded?.state.verdict?.overall.label;
  const info = verdictInfo(label);
  const claim = loaded?.state.input?.text;
  if (!info || !claim) return { title: `Case ${id} · ACHP` };
  const title = `ACHP · ${info.name}: ${excerpt(claim, 80)}`;
  const description = loaded?.state.verdict?.overall.summary;
  return { title, description, openGraph: { title, description, type: 'article' }, twitter: { card: 'summary_large_image', title, description } };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
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
  const loaded = await loadCase(id);
  if (!loaded) notFound();

  // ?replay=1: a finished case as a scroll story (P6). Decision: same route and the same server load (no
  // second page), so the case's title, OG image and SSR stay one code path; a run still in progress
  // isn't a story yet and falls through to the live board.
  const finished = loaded.events.some((e) => e.type === 'run.completed' || e.type === 'run.failed');
  if (one(sp.replay) === '1' && finished && !loaded.expired) {
    const report =
      id.startsWith(FIXTURE_PREFIX) && loaded.fixture
        ? `/case/${id}${one(sp.speed) ? `?speed=${one(sp.speed)}` : ''}`
        : `/case/${id}`;
    return (
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <ReplayStory events={loaded.events} reportHref={report} />
      </main>
    );
  }

  if (id.startsWith(FIXTURE_PREFIX) && loaded.fixture) {
    // Dev/test replay of a recorded log (P3). Never served in production.
    const opts = parseReplayOptions(
      [one(sp.speed) && `speed=${one(sp.speed)}`, one(sp.drop) && `drop=${one(sp.drop)}`].filter(Boolean).join(','),
    );
    return (
      <CaseLive
        key={`${loaded.fixture}:${opts.speed}:${opts.drop}`}
        runId={loaded.events[0].run_id}
        // Like a real run opened right after POST /runs, the first paint already has the stored head of the
        // log (the claim the reader just typed), and the replay streams the rest after it.
        initialEvents={loaded.events.slice(0, loaded.events.findIndex((e) => e.type === 'run.started') + 1)}
        baseUrl={`/api/dev/fixture/${loaded.fixture}/${replayOptionsSegment(opts)}`}
        fixture={{ name: loaded.fixture, speed: opts.speed }}
        benchmark={readBenchmark()}
      />
    );
  }

  // A run that already has a stored log renders on the server (fast LCP); a live one resumes from it.
  return (
    <CaseLive
      key={id}
      runId={loaded.events[0]?.run_id ?? id}
      initialEvents={loaded.events}
      expired={loaded.expired}
      sample={loaded.sample}
      benchmark={readBenchmark()}
    />
  );
}

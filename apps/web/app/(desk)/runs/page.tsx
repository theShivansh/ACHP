import type { Metadata } from 'next';
import { RunsPage, type SampleRow } from '@/components/runs/RunsPage';
import { SAMPLES } from '@/lib/runs/fixtures';
import { loadCase } from '@/lib/runs/loadCase';
import { summarize } from '@/lib/runs/runSummary';

export const metadata: Metadata = {
  title: 'Your checks · ACHP',
  description: 'The checks you opened in this browser, and where each sits between facts and tone.',
};

export default async function Page() {
  // The recorded samples for the empty state are read here, on the server: they ship with the app.
  const samples: SampleRow[] = [];
  for (const s of SAMPLES) {
    const loaded = await loadCase(s.id);
    const summary = loaded ? summarize(s.id, loaded.events) : null;
    if (summary) samples.push({ id: s.id, summary });
  }
  return <RunsPage samples={samples} />;
}

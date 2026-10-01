import type { Metadata } from 'next';
import { MethodPage, type Benchmark, type MethodAgent } from '@/components/method/MethodPage';
import benchmark from '@/lib/benchmark.generated.json';
import { loadCase } from '@/lib/runs/loadCase';

export const metadata: Metadata = {
  title: 'How ACHP decides · ACHP',
  description: 'The seven agents, the five scores and what we found when we tested our own formulas.',
};

export default async function Page() {
  // The agents' names and roles come from a recorded check's own run.started, never from a list kept in the UI.
  const loaded = await loadCase('sample-exercise-mixed');
  const started = loaded?.events.find((e) => e.type === 'run.started');
  const agents: MethodAgent[] =
    started && started.type === 'run.started' ? started.data.agents.map((a) => ({ id: a.id, name: a.name, role: a.role, group: a.group })) : [];
  return <MethodPage agents={agents} benchmark={benchmark as Benchmark} />;
}

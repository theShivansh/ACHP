import { ReplayStory } from '@/components/story/ReplayStory';
import { loadCase } from '@/lib/runs/loadCase';

/** The stored recorded check the Desk replays as "How a check works" (07 §2). Server component. */
export async function DeskStory() {
  const loaded = await loadCase('sample-exercise-mixed');
  if (!loaded) return null;
  return <ReplayStory embedded events={loaded.events} reportHref="/case/sample-exercise-mixed" />;
}

import { notFound } from 'next/navigation';
import { DeskHome } from '@/components/desk/DeskHome';
import { DeskStory } from '@/components/desk/DeskStory';

// Temporary mount of the Desk while the legacy single-page UI still owns `/` (P9; moved to `/` when it is retired).
export default async function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DeskHome story={await DeskStory()} />;
}

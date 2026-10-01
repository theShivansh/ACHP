import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DeskHome } from '@/components/desk/DeskHome';
import { DeskStory } from '@/components/desk/DeskStory';

export const metadata: Metadata = {
  title: 'ACHP · Check a message before you forward it',
  description: 'Seven specialist agents take a claim apart, pin the evidence and argue about it in plain sight. You see every step.',
};

export default async function Page() {
  // useSearchParams (a prefilled claim from /ask) needs a boundary; the story is read on the server from a recorded check.
  return (
    <Suspense>
      <DeskHome story={await DeskStory()} />
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { DeskHome } from '@/components/desk/DeskHome';
import { DeskStory } from '@/components/desk/DeskStory';

export const metadata: Metadata = {
  title: 'ACHP · Check a message before you forward it',
  description: 'Seven specialist agents take a claim apart, pin the evidence and argue about it in plain sight. You see every step.',
};

export default async function Page() {
  // The Desk renders on the server; only the ?claim= prefill reads the request (inside DeskHome, in its own boundary).
  // The story is read on the server from a recorded check.
  return <DeskHome story={await DeskStory()} />;
}

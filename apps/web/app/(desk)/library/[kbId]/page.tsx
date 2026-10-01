import type { Metadata } from 'next';
import { LibraryDetail } from '@/components/library/LibraryDetail';

export const metadata: Metadata = {
  title: 'Library · ACHP',
  description: 'One library: what it holds, chunk by chunk.',
};

export default async function Page({ params }: { params: Promise<{ kbId: string }> }) {
  const { kbId } = await params;
  return <LibraryDetail kbId={kbId} />;
}

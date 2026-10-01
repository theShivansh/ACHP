import type { Metadata } from 'next';
import { LibraryPage } from '@/components/library/LibraryPage';

export const metadata: Metadata = {
  title: 'Libraries · ACHP',
  description: 'Your own documents, for checking claims against and asking questions of.',
};

export default function Page() {
  return <LibraryPage />;
}

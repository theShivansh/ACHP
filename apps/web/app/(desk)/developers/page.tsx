import type { Metadata } from 'next';
import { DevelopersPage } from '@/components/developers/DevelopersPage';

export const metadata: Metadata = {
  title: 'For developers · ACHP',
  description: 'Start a check, follow it live and read the event log, with copyable examples.',
};

export default function Page() {
  return <DevelopersPage />;
}

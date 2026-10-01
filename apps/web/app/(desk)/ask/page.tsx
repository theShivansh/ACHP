import type { Metadata } from 'next';
import { AskPage } from '@/components/ask/AskPage';

export const metadata: Metadata = {
  title: 'Ask a library · ACHP',
  description: 'Ask a question of your own documents. Every sentence of the answer points to the passage it comes from.',
};

export default function Page() {
  return <AskPage />;
}

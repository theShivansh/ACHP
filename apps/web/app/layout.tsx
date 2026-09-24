import type { Metadata } from 'next';
import { BoilDefs } from './_components/BoilDefs';
import { fontVariables } from './fonts';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'ACHP — Narrative Integrity System',
  description: 'ACHP: AI Claim Hardening Pipeline — Knowledge Base Manager + 7-agent Narrative Integrity Analyzer.',
  keywords: ['ACHP', 'AI', 'claim verification', 'NIL', 'narrative integrity', 'knowledge base'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <BoilDefs />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

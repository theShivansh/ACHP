import type { Metadata } from 'next';
import { BoilDefs } from './_components/BoilDefs';
import { fontVariables } from './fonts';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: { default: 'ACHP · Check a message before you forward it', template: '%s' },
  description: 'ACHP checks a claim with seven specialist agents, pins the evidence and shows every step.',
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

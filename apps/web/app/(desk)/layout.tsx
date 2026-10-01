import { Toaster } from '@/components/ui/sonner';
import { BackendProvider } from '@/lib/backend';
import { DeskHeader } from './_components/DeskHeader';

// The Fact-Checker's Desk shell: the header, the backend status and the page.
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackendProvider>
    <div className="flex min-h-dvh flex-col bg-desk text-desk-ink">
      <a
        href="#main"
        className="sr-only rounded-button bg-desk-raised px-3 py-2 type-ui text-desk-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <DeskHeader />
      {/* Each page renders its own <main id="main">, so a page's asides (the case's Agents and
          Evidence) stay top-level landmarks beside it rather than inside it. */}
      <div className="flex flex-1 flex-col">{children}</div>
      <Toaster />
    </div>
    </BackendProvider>
  );
}

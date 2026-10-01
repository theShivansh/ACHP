import { notFound } from 'next/navigation';
import { DeskHarness } from './DeskHarness';

// Dev and test only: the Desk's claim input on its own, until the real `/` is built in P9. It lets the shake and
// the claim → case morph be exercised against a fixture replay. 404 in production, like /api/dev/fixture.
export default function DevDeskPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main id="main" className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12 md:px-6">
      <h1 className="type-h2 text-desk-ink">Check a claim</h1>
      <p className="mt-1 mb-6 type-body text-desk-ink-2">
        A test page for the Desk&apos;s claim input. Submitting opens a recorded case, not a new check.
      </p>
      <DeskHarness />
    </main>
  );
}

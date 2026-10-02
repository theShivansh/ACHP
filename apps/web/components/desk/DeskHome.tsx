'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ClaimInput } from '@/components/desk/ClaimInput';
import { LibrarySelect } from '@/components/desk/LibrarySelect';
import { buttonVariants } from '@/components/ui/button';
import { useActiveLibrary } from '@/lib/activeLibrary';
import { useBackend } from '@/lib/backend';
import { startRun } from '@/lib/runs/api';
import { rememberRun } from '@/lib/runs/history';
import { openCase } from '@/lib/transitions';

// The Desk (07 §2): a headline, a sheet to paste the message on, three neutral examples that fill the field (never
// submit it), and, below, the recorded check replayed as a story. Submitting while the backend still wakes keeps the
// claim on the sheet and starts the run when /health answers (S2.3).

/** Neutral, checkable, non-inflammatory: a health figure, a historical date, a product claim (07 §2). */
export const EXAMPLE_CLAIMS = [
  'Regular exercise cuts the risk of heart disease by 30 to 40 percent.',
  'The Berlin Wall fell in 1989.',
  'Electric cars produce no emissions at all.',
] as const;

/**
 * "Check it as a claim instead" (/ask) lands on /?claim=… with the question prefilled. Reading the query is the only
 * part of the Desk that needs the request, so it is its own small island: the rest of the page renders on the server
 * (a Suspense boundary around all of it would ship an empty <main> and paint the headline only after hydration).
 */
function ClaimFromQuery({ onClaim }: { onClaim: (claim: string) => void }) {
  const claim = useSearchParams().get('claim');
  useEffect(() => {
    if (claim) onClaim(claim.slice(0, 4000));
  }, [claim, onClaim]);
  return null;
}

export function DeskHome({ story }: { story?: React.ReactNode }) {
  const router = useRouter();
  const backend = useBackend();
  const active = useActiveLibrary();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');

  const submit = async (claim: string) => {
    // The claim stays on the sheet while the desk wakes; the check starts when it answers.
    await backend.whenReady();
    const created = await startRun(claim, active ?? undefined);
    rememberRun(created.run_id);
    openCase(router, created.run_id);
  };

  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <Suspense>
        <ClaimFromQuery onClaim={setText} />
      </Suspense>
      <div className="mx-auto w-full max-w-[880px] px-4 pt-12 pb-10 md:px-6 md:pt-20">
        <h1 className="max-w-[20ch] font-display text-[2.25rem] leading-[1.1] font-medium text-balance text-desk-ink md:text-[2.75rem] [font-variation-settings:'opsz'_60]">
          Before you forward it, check it.
        </h1>
        <p className="mt-4 max-w-[56ch] text-[1.125rem] leading-relaxed text-desk-ink-2">
          Seven specialist agents take a claim apart, pin the evidence and argue about it in plain sight. You see every step.
        </p>

        <div className="mt-8">
          <ClaimInput
            onSubmit={submit}
            value={text}
            onValueChange={setText}
            textareaRef={field}
            waiting={backend.status !== 'ready'}
            placeholder="Paste the message you were forwarded"
            footer={<LibrarySelect />}
          />
        </div>

        <div className="mt-5" role="group" aria-labelledby="try-one">
          <p id="try-one" className="type-meta text-desk-ink-2">
            Try one. It fills the field; you decide when to check it.
          </p>
          <ul className="mt-2 flex flex-col gap-1 md:flex-row md:flex-wrap md:gap-x-3">
            {EXAMPLE_CLAIMS.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => {
                    setText(c);
                    field.current?.focus();
                  }}
                  className="min-h-11 cursor-pointer rounded-button border-(length:--rule) border-desk-line px-3 py-2 text-left font-display text-[1rem] leading-snug text-desk-ink hover:bg-desk-raised md:min-h-9"
                >
                  “{c}”
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-10">
          <a href="#how-it-works" className="inline-flex min-h-11 items-center gap-2 type-ui text-desk-ink underline decoration-(length:--rule) underline-offset-4">
            How a check works
            <span className="text-desk-ink-2 no-underline">(a one-minute read)</span>
          </a>
        </p>
      </div>

      {story}

      <section aria-labelledby="home-cta" className="mx-auto w-full max-w-[880px] px-4 pt-8 pb-20 md:px-6">
        <h2 id="home-cta" className="type-h2 text-desk-ink">
          Have a message you are unsure about?
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
              field.current?.focus({ preventScroll: true });
            }}
            className={buttonVariants({ size: 'lg' })}
          >
            Check a message
          </button>
          <Link href="/method" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            How ACHP decides
          </Link>
        </div>
      </section>
    </main>
  );
}

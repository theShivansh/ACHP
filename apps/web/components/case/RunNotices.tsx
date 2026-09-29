'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { stageWords } from '@/lib/runs/announcer';
import type { RunFailed } from '@/lib/runs/types';

// System states on the sheet (07 §3.3). Plain words, no spinner, no percentage. The waking and
// queued notices are derived from /health and run.queued; the rest from the connection and the log.

function Ruled({ children, tone = 'graphite' }: { children: React.ReactNode; tone?: 'graphite' | 'ochre' }) {
  const border = tone === 'ochre' ? 'border-ochre' : 'border-sheet-line';
  return <div className={`border-y-(length:--rule) ${border} py-4`}>{children}</div>;
}

export function WakingNotice() {
  return (
    <Ruled tone="ochre">
      <p className="type-body text-ink">Waking the desk.</p>
      <p className="mt-1 type-meta text-ink-2">Free-tier servers sleep when idle; this takes up to a minute.</p>
    </Ruled>
  );
}

export function QueuedNotice({ position }: { position: number }) {
  const ahead = position - 1;
  return (
    <Ruled>
      <p className="type-body text-ink">
        Waiting for a free desk · {ahead > 0 ? `${ahead} ahead` : 'next in line'}
      </p>
    </Ruled>
  );
}

export function InterruptedBanner({
  step,
  gaveUp,
  onReconnect,
  onRerun,
}: {
  step: number;
  /** Three reconnects failed: offer the buttons. Before that, it's reconnecting on its own. */
  gaveUp: boolean;
  onReconnect: () => void;
  onRerun: (() => void) | null;
}) {
  return (
    // On the desk, above the sheet: desk inks (the paper inks fail contrast here).
    // Reconnecting on its own is said once by the status line; only giving up is an alert.
    <div data-interrupted role={gaveUp ? 'alert' : undefined} className="mx-auto mb-6 max-w-[760px] border-y-(length:--rule) border-desk-ochre py-3">
      <p className="type-body text-desk-ink">
        Lost connection{step > 0 ? ` at step ${step}` : ''}. {gaveUp ? 'The check may still be running.' : 'Reconnecting…'}
      </p>
      {gaveUp && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onReconnect}>Reconnect</Button>
          {onRerun && (
            <Button variant="secondary" onClick={onRerun}>
              Run it again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FailedCard({
  failure,
  kept,
  onRerun,
}: {
  failure: RunFailed;
  kept: { sources: number; parts: number };
  onRerun: (() => void) | null;
}) {
  const keptWords = [
    kept.sources ? `${kept.sources} ${kept.sources === 1 ? 'source' : 'sources'}` : null,
    kept.parts ? `${kept.parts} ${kept.parts === 1 ? 'part' : 'parts'}` : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="failed-title" data-failed-stage={failure.stage}>
      <Ruled tone="ochre">
        <h2 id="failed-title" className="type-h2 text-balance text-ink">
          The check stopped at the {stageWords(failure.stage)} step
        </h2>
        <p className="mt-2 max-w-[60ch] type-body text-ink-2">{failure.message}</p>
        <p className="mt-2 type-meta text-ink-2">
          {keptWords.length
            ? `What was found before it stopped is kept below: ${keptWords.join(' and ')}. There is no verdict.`
            : 'Nothing was found before it stopped. There is no verdict.'}
        </p>
        {onRerun && (
          <Button className="mt-3" onClick={onRerun}>
            Run it again
          </Button>
        )}
      </Ruled>
    </section>
  );
}

/** The Gatekeeper's reason without the "Not checked:" the stamp and heading already say. */
function plainReason(reason: string): string {
  const r = reason.replace(/^not checked:\s*/i, '').trim();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function BlockedNotice({ reason }: { reason: string }) {
  return (
    <section aria-labelledby="blocked-title" data-blocked>
      <Ruled>
        <h2 id="blocked-title" className="type-h2 text-balance text-ink">
          This message wasn&apos;t checked
        </h2>
        <p className="mt-2 max-w-[60ch] type-body text-ink-2">{plainReason(reason)}</p>
        <p className="mt-2 type-meta text-ink-2">
          Only the Gatekeeper ran. No sources were searched and no scores were computed.
        </p>
      </Ruled>
    </section>
  );
}

export function ExpiredNotice() {
  return (
    <Ruled>
      <p className="type-body text-ink">This case is no longer stored.</p>
      <p className="mt-2 type-meta text-ink-2">
        Cases are kept for 72 hours. <Link className="text-pencil-blue underline underline-offset-4" href="/">Start a new check</Link>
      </p>
    </Ruled>
  );
}

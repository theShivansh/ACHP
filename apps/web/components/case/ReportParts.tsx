'use client';

import { cn } from 'cn';
import { Copy, Printer, Share2 } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { shareSummary } from '@/lib/report';
import type { NotSettledReading } from '@/lib/notSettled';
import { BANDS, excerpt, VERDICTS, type BandKey } from '@/lib/verdict';
import type { Label, VerdictFinal } from '@/lib/runs/types';

// The small, reusable pieces of the completed report (P4).

/** Strong / Moderate / Weak in words, a 3-segment bar (never a %), and the reason in a sentence. */
export function ConfidenceBand({ band, reason, className }: { band: BandKey; reason: string; className?: string }) {
  const b = BANDS[band];
  return (
    <div data-band={band} className={cn('max-w-[68ch]', className)}>
      {/* It says how firmly the sources hold this verdict, not that they back the claim. */}
      <p className="type-meta font-semibold text-ink-2">Confidence in this verdict</p>
      <div className="mt-1 flex items-start gap-3">
        <span aria-hidden="true" className="mt-2 flex shrink-0 gap-1">
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn('h-1.5 w-5 rounded-[1px]', i <= b.segments ? 'bg-ink-2' : 'border-(length:--rule) border-ink-3')} />
          ))}
        </span>
        <p className="type-body text-ink-2">
          <span className="font-semibold text-ink">{b.name}.</span> {reason}
        </p>
      </div>
    </div>
  );
}

/**
 * ACHP's own reading of the evidence, set apart from the quotes: Public Sans in --ink-2, with a
 * label and no left rule (a rule is what marks a quotation). Interpretation is never in quote style.
 */
export function InterpretationNote({
  children,
  sources = [],
  onOpenSource,
  className,
}: {
  children: React.ReactNode;
  /** The sources the reading rests on, by their number in the Evidence tab. */
  sources?: { id: string; n: number }[];
  onOpenSource?: (evidenceId: string) => void;
  className?: string;
}) {
  return (
    <div data-interpretation className={cn('max-w-[68ch]', className)}>
      <p className="type-meta font-semibold text-ink-2">ACHP&apos;s reading</p>
      <p className="mt-1 type-body text-ink-2">{children}</p>
      {sources.length > 0 && onOpenSource && (
        <p data-cited className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-ink-2">
          <span>From</span>
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenSource(s.id)}
              className="inline-flex min-h-6 cursor-pointer items-center rounded-chip border-(length:--rule) border-sheet-line px-2 text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
            >
              Source {s.n}
              <span className="sr-only"> in the Evidence tab</span>
            </button>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * Under a "Not settled" stamp: why nothing settled it, the Assay's closest reading (a hint, never a verdict) and what
 * would settle it. Sheet prose in --ink-2 with a label and no rule (a rule marks a quotation).
 */
export function NotSettled({ reading, className }: { reading: NotSettledReading; className?: string }) {
  return (
    <div data-not-settled className={cn('max-w-[68ch]', className)}>
      <p className="type-meta font-semibold text-ink-2">{reading.lead}</p>
      <p className="mt-1 type-body text-ink-2">{reading.why}</p>
      {reading.found && (
        <p data-not-settled-found className="mt-2 type-body text-ink-2" dir="auto">
          {reading.found}
        </p>
      )}
      {reading.reviewers.length > 0 && (
        <ul data-not-settled-reviewers className="mt-2 flex flex-col gap-1 type-body text-ink-2">
          {reading.reviewers.map((r) => (
            <li key={r.who}>
              <span className="font-semibold text-ink">{r.who}: </span>
              <span dir="auto">{r.said}</span>
            </li>
          ))}
        </ul>
      )}
      {reading.scores && (
        <p data-not-settled-scores className="mt-2 type-body text-ink-2">
          {reading.scores}
        </p>
      )}
      <p className="mt-2 type-body text-ink-2">{reading.next}</p>
    </div>
  );
}

/**
 * Where the message goes wrong, pulled up beside the reading so a long report doesn't hide it: each
 * part the Judge did not rule Supported, with its stamp word and a link down to the strip.
 */
export function PartsThatDontHold({
  parts,
}: {
  parts: { claimId: string; part: number; label: Label; text: string }[];
}) {
  if (parts.length === 0) return null;
  return (
    <div data-not-holding className="mt-4 max-w-[68ch]">
      <p className="type-meta font-semibold text-ink-2">
        {/* A part nobody could settle is not a part that is wrong: say which it is. */}
        {parts.every((p) => p.label === 'unverifiable' || p.label === 'missing_context')
          ? parts.length === 1
            ? 'The part we could not settle'
            : 'The parts we could not settle'
          : parts.length === 1
            ? 'The part that does not hold'
            : 'The parts that do not hold'}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {parts.map((p) => {
          const info = VERDICTS[p.label];
          return (
            <li key={p.claimId} className="type-body text-ink">
              <a
                href={`#part-${p.claimId}`}
                className="inline-block min-h-6 py-0.5 text-ink underline decoration-(length:--rule) decoration-ink-3 underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
              >
                <span className={cn('type-meta mr-2 font-semibold', info.text)}>{info.name}</span>
                Part {p.part}: {excerpt(p.text, 90)}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function caseUrl(runId: string): string {
  const u = new URL(window.location.href);
  return `${u.origin}/case/${runId}`;
}

/**
 * Copies and says so in place: the button's check and "Copied" are the confirmation (ConfirmButton), so a success
 * has no toast on top of it. Only a failure needs a message, and it gets one the reader can see and hear.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    notify('Copying was blocked by the browser. Select the text and copy it by hand.');
    return false;
  }
}

/** Copy summary · Copy link · Share (where the browser offers it) · Replay the investigation. */
export function ShareBar({
  runId,
  claim,
  verdict,
  fixture,
}: {
  runId: string;
  claim: string;
  verdict: VerdictFinal;
  fixture: boolean;
}) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div data-share-bar className="mt-8 flex flex-wrap items-center gap-2 border-t-(length:--rule) border-sheet-line pt-6">
      <ConfirmButton
        variant="primary"
        icon={Copy}
        label="Copy summary"
        doneLabel="Copied"
        announcement="Summary copied."
        run={() => copy(shareSummary({ claim, verdict, url: caseUrl(runId) }))}
      />
      <ConfirmButton
        icon={Copy}
        label="Copy link"
        doneLabel="Copied"
        announcement="Link copied."
        run={() => copy(caseUrl(runId))}
      />
      {canShare && (
        <ConfirmButton
          icon={Share2}
          label="Share"
          doneLabel="Shared"
          announcement="Shared."
          // Cancelling the browser's share sheet is not an error: nothing is confirmed and nothing is said.
          run={() =>
            navigator
              .share({ title: 'ACHP', text: shareSummary({ claim, verdict, url: caseUrl(runId) }), url: caseUrl(runId) })
              .then(() => true, () => false)
          }
        />
      )}
      {/* The browser's own print dialog saves a PDF: the report has a print stylesheet (globals.css), so nothing is rendered to an image. */}
      <Button type="button" variant="secondary" className="pointer-coarse:h-11" onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Print or save as PDF
      </Button>
      {/* The replay itself is built in P6; the link is the contract (?replay=1). */}
      {!fixture && (
        <a
          href={`/case/${runId}?replay=1`}
          className="inline-flex min-h-6 items-center type-ui text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
        >
          Replay the investigation
        </a>
      )}
    </div>
  );
}

/**
 * Editor's desk (flag NEXT_PUBLIC_FF_HUMAN_REVIEW): shown when the case rests on Weak evidence.
 * The button is a stub. TODO(ACHP X FR-005): send the case to a human reviewer. The adversary-
 * disagreement trigger (≥0.4) needs a field the event log does not carry yet, so only the band
 * triggers it.
 */
export function EditorsDesk({ band }: { band: BandKey }) {
  if (process.env.NEXT_PUBLIC_FF_HUMAN_REVIEW !== '1' || band !== 'weak') return null;
  return (
    <aside aria-label="Editor's desk" className="mt-6 border-y-(length:--rule) border-ochre py-4">
      <p className="type-body text-ink">This one rests on weak evidence, so a person should look at it.</p>
      <Button
        className="mt-3"
        variant="secondary"
        onClick={() => notify('Human review is not connected yet. This button does nothing for now.')}
      >
        Request review
      </Button>
    </aside>
  );
}

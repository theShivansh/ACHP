'use client';

import { cn } from 'cn';
import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { shareSummary } from '@/lib/report';
import { BANDS, type BandKey } from '@/lib/verdict';
import type { VerdictFinal } from '@/lib/runs/types';

// The small, reusable pieces of the completed report (P4).

/** Strong / Moderate / Weak in words, a 3-segment bar (never a %), and the reason in a sentence. */
export function ConfidenceBand({ band, reason, className }: { band: BandKey; reason: string; className?: string }) {
  const b = BANDS[band];
  return (
    <div data-band={band} className={cn('flex items-start gap-3', className)}>
      <span aria-hidden="true" className="mt-1.5 flex shrink-0 gap-1">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1.5 w-5 rounded-[1px]', i <= b.segments ? 'bg-ink-2' : 'bg-sheet-line')} />
        ))}
      </span>
      <p className="max-w-[68ch] type-body text-ink-2">
        <span className="font-semibold text-ink">{b.name}.</span> {reason}
      </p>
    </div>
  );
}

/**
 * ACHP's own reading of the evidence, set apart from the quotes: Public Sans in --ink-2, with a
 * label and no left rule (a rule is what marks a quotation). Interpretation is never in quote style.
 */
export function InterpretationNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-interpretation className={cn('max-w-[68ch]', className)}>
      <p className="type-meta font-semibold text-ink-2">ACHP&apos;s reading</p>
      <p className="mt-1 type-body text-ink-2">{children}</p>
    </div>
  );
}

function caseUrl(runId: string): string {
  const u = new URL(window.location.href);
  return `${u.origin}/case/${runId}`;
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
    return true;
  } catch {
    toast('Copying was blocked by the browser. Select the text and copy it by hand.');
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
  const [copied, setCopied] = useState<'summary' | 'link' | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const flash = (what: 'summary' | 'link') => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };
  return (
    <div data-share-bar className="mt-8 flex flex-wrap items-center gap-2 border-t-(length:--rule) border-sheet-line pt-6">
      <Button
        variant="primary"
        onClick={async () => {
          if (await copy(shareSummary({ claim, verdict, url: caseUrl(runId) }), 'Summary copied')) flash('summary');
        }}
      >
        {copied === 'summary' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        Copy summary
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          if (await copy(caseUrl(runId), 'Link copied')) flash('link');
        }}
      >
        {copied === 'link' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        Copy link
      </Button>
      {canShare && (
        <Button
          variant="secondary"
          onClick={() =>
            void navigator
              .share({ title: 'ACHP', text: shareSummary({ claim, verdict, url: caseUrl(runId) }), url: caseUrl(runId) })
              .catch(() => {})
          }
        >
          <Share2 aria-hidden="true" />
          Share
        </Button>
      )}
      {/* The replay itself is built in P6; the link is the contract (?replay=1). */}
      {!fixture && (
        <a
          href={`/case/${runId}?replay=1`}
          className="inline-flex min-h-6 items-center type-ui text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
        >
          Replay the investigation
        </a>
      )}
      <span role="status" className="sr-only">
        {copied === 'summary' ? 'Summary copied.' : copied === 'link' ? 'Link copied.' : ''}
      </span>
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
        onClick={() => toast('Human review is not connected yet. This button does nothing for now.')}
      >
        Request review
      </Button>
    </aside>
  );
}

'use client';

import { cn } from 'cn';
import { ExternalLink } from 'lucide-react';
import { PaperclipGlyph } from '@/components/glyphs';
import type { EvidenceCard as Card, EvidenceUse } from '@/lib/runs/reducer';

// Evidence tray v1 (04 §7, 07 §4). A card per evidence.found: where it came from, the verbatim quote
// the Clipper pinned, and what the log says it was used for ("Contradicts part 2"). A relation is
// shown only once a mark or the verdict states it; retrieval alone doesn't say which way a source
// points. New cards enter with --dur-base.

const USE_WORDS: Record<EvidenceUse['relation'], string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  missing_context: 'Adds context to',
  framing: 'On the wording of',
  unclear: 'Mentions',
};

const USE_TONE: Record<EvidenceUse['relation'], string> = {
  supports: 'text-support',
  contradicts: 'text-pencil-red',
  missing_context: 'text-ochre',
  framing: 'text-ochre',
  unclear: 'text-ink-2',
};

const RULE_TONE: Record<EvidenceUse['relation'], string> = {
  supports: 'border-support',
  contradicts: 'border-pencil-red',
  missing_context: 'border-ochre',
  framing: 'border-ochre',
  unclear: 'border-ink-3',
};

/**
 * Display-only: a quote that starts with an unmatched quotation mark (scraped mid-quotation) loses
 * that one edge character, so it doesn't render as `“" To reduce…`. The body is untouched.
 */
function displayQuote(q: string): string {
  let t = q.trim();
  const opens = /^["“'‘]/.test(t);
  const closes = /["”'’]$/.test(t);
  if (opens && closes && t.length > 1) t = t.slice(1, -1);
  else if (opens) t = t.slice(1);
  else if (closes && !/["“]/.test(t.slice(0, -1))) t = t.slice(0, -1);
  return t.trim();
}

const KIND_WORDS = { web: 'Web', kb: 'Your library', context: 'Text you added' } as const;

function published(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function EvidenceCard({ card, uses }: { card: Card; uses: EvidenceUse[] }) {
  const src = card.source;
  const where = src.domain ?? KIND_WORDS[src.kind];
  const date = published(src.published_at);
  // One relation colors the quote's rule; a source used both ways gets a neutral rule and the
  // labels below carry the colors.
  const kinds = new Set(uses.map((u) => u.relation));
  const rule = kinds.size === 1 ? RULE_TONE[uses[0].relation] : 'border-graphite';
  return (
    <li
      data-evidence={card.evidence_id}
      className="paper relative rounded-card px-4 pt-4 pb-3 shadow-lift-card animate-[rise-in_var(--dur-base)_var(--ease-out)]"
    >
      <PaperclipGlyph aria-hidden="true" className="absolute -top-2 left-3 size-5 text-graphite" />
      <p className="flex flex-wrap items-baseline gap-x-2 type-meta text-ink-2">
        <span className="truncate">{where}</span>
        <span className={cn('tabular-nums', !date && 'text-ink-3')}>· {date ? `Published ${date}` : 'Date not given'}</span>
        <span className="sr-only">· source {card.evidence_id}</span>
      </p>
      {src.title && <h3 className="mt-1 type-ui font-semibold text-ink">{src.title}</h3>}
      <blockquote className={cn('mt-2 border-l-2 pl-3 font-display type-body text-ink', rule)}>
        {/* The quote is verbatim; it gets our quotation marks unless it already carries its own. */}
        <p className="line-clamp-6">“{displayQuote(card.quote)}”</p>
      </blockquote>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {uses.length > 0 ? (
          <p className="type-meta font-semibold">
            {uses.map((u, i) => (
              <span key={`${u.claimId}-${u.relation}`} className={USE_TONE[u.relation]}>
                {i > 0 && ', '}
                {USE_WORDS[u.relation]} part {u.part}
              </span>
            ))}
          </p>
        ) : (
          <span />
        )}
        {src.url && (
          <a
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-6 items-center gap-1 type-meta text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2"
          >
            Open source
            <ExternalLink aria-hidden="true" className="size-3.5 stroke-[1.5]" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  );
}

export function EvidenceTray({
  cards,
  usesOf,
  filter,
  onClearFilter,
  className,
  headingId,
  emptyText,
  inSheet = false,
}: {
  cards: Card[];
  usesOf: (evidenceId: string) => EvidenceUse[];
  /** Showing only the sources of one part ("part 2"), or null for all. */
  filter: { part: number; ids: string[] } | null;
  onClearFilter: () => void;
  className?: string;
  headingId: string;
  /** What an empty tray says (while the Clipper works, or after a run that found nothing). */
  emptyText: string;
  /** Inside a Sheet that already titles it "Evidence": the heading becomes screen-reader only. */
  inSheet?: boolean;
}) {
  const shown = filter ? cards.filter((c) => filter.ids.includes(c.evidence_id)) : cards;
  return (
    <section aria-labelledby={headingId} className={className}>
      <header className={cn('flex items-baseline justify-between gap-3 pb-3', inSheet && 'sr-only')}>
        <h2 id={headingId} className="type-ui font-semibold text-surface-fg">
          Evidence
        </h2>
        <p className="type-meta text-surface-fg-2 tabular-nums">
          {cards.length === 1 ? '1 source' : `${cards.length} sources`}
        </p>
      </header>
      {filter && (
        <p className="mb-3 flex items-center justify-between gap-3 type-meta text-surface-fg-2">
          <span>Showing the sources for part {filter.part}.</span>
          <button
            type="button"
            onClick={onClearFilter}
            className="min-h-6 cursor-pointer text-surface-blue underline decoration-(length:--rule) underline-offset-4"
          >
            Show all
          </button>
        </p>
      )}
      {cards.length === 0 ? (
        <p className="type-meta text-surface-fg-2">{emptyText}</p>
      ) : (
        <ol className="flex flex-col gap-4 pt-2">
          {shown.map((c) => (
            <EvidenceCard key={c.evidence_id} card={c} uses={usesOf(c.evidence_id)} />
          ))}
        </ol>
      )}
    </section>
  );
}

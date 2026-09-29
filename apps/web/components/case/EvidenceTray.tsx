'use client';

import { cn } from 'cn';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { PaperclipGlyph } from '@/components/glyphs';
import type { EvidenceCard as Card, EvidenceUse } from '@/lib/runs/reducer';
import { useLinkState, useLinkStore } from './linkStore';

// Evidence cards (04 §7, 07 §4). A card per evidence.found: where it came from, the verbatim quote
// the Clipper pinned, and what the log says it was used for ("Contradicts part 2"). Everything
// here is read from the event; a field the log doesn't carry (strength, freshness, verifier
// status: the verifier arrives in P8) is left out, never filled in. Hovering or focusing a card
// lights the strips it bears on (linkStore).

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

const KIND_WORDS = { web: 'Web', kb: 'Your library', context: 'Text you added' } as const;

/**
 * Display-only: a quote that starts with an unmatched quotation mark (scraped mid-quotation) loses
 * that one edge character, so it doesn't render as `“" To reduce…`. The body is untouched.
 */
export function displayQuote(q: string): string {
  let t = q.trim();
  const opens = /^["“'‘]/.test(t);
  const closes = /["”'’]$/.test(t);
  if (opens && closes && t.length > 1) t = t.slice(1, -1);
  else if (opens) t = t.slice(1);
  else if (closes && !/["“]/.test(t.slice(0, -1))) t = t.slice(0, -1);
  return t.trim();
}

function published(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function strengthWords(strength: number | null | undefined): string | null {
  if (strength == null) return null;
  return strength >= 0.7 ? 'Strong source' : strength >= 0.4 ? 'Moderate source' : 'Weak source';
}

/** The site's icon, with the paperclip when it can't be loaded (offline, blocked, none). */
function Favicon({ domain }: { domain: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return <PaperclipGlyph aria-hidden="true" className="size-4 shrink-0 text-graphite" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 16px third-party icon with an onError fallback
    <img
      src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-4 shrink-0"
    />
  );
}

export function EvidenceCard({ card, uses }: { card: Card; uses: EvidenceUse[] }) {
  const src = card.source;
  const store = useLinkStore();
  const link = useLinkState('evidence', card.evidence_id);
  const where = src.domain ?? KIND_WORDS[src.kind];
  const date = published(src.published_at);
  const kinds = new Set(uses.map((u) => u.relation));
  const rule = kinds.size === 1 ? RULE_TONE[uses[0].relation] : 'border-graphite';
  const aged = card.freshness != null && card.freshness < 0.4;
  const strength = strengthWords(card.strength);
  const verifier = card.verifier_status === 'accepted' ? 'Verified' : card.verifier_status === 'rejected' ? 'Could not be verified' : null;
  const lit = () => store.set({ kind: 'evidence', id: card.evidence_id, related: [...new Set(uses.map((u) => u.claimId))] });
  const off = () => store.set(null);

  return (
    <li
      data-evidence={card.evidence_id}
      data-link={link}
      data-aged={aged || undefined}
      tabIndex={0}
      onPointerEnter={lit}
      onPointerLeave={off}
      onFocus={lit}
      onBlur={off}
      className={cn(
        'paper relative rounded-card px-4 pt-4 pb-3 shadow-lift-card transition-opacity duration-(--dur-quick) animate-[rise-in_var(--dur-base)_var(--ease-out)]',
        link === 'dimmed' && 'opacity-45',
        link === 'active' && 'outline-2 outline-pencil-blue',
      )}
    >
      <PaperclipGlyph aria-hidden="true" className="absolute -top-2 left-3 size-5 text-graphite" />
      <p className="flex flex-wrap items-center gap-x-2 type-meta text-ink-2">
        <Favicon domain={src.domain} />
        <span className="truncate">{where}</span>
        <span className={cn('tabular-nums', !date && 'text-ink-3')}>· {date ? `Published ${date}` : 'Date not given'}</span>
        {aged && <span className="text-ochre">· older source</span>}
        <span className="sr-only">· source {card.evidence_id}</span>
      </p>
      {src.title && <h3 className="mt-1 type-ui font-semibold text-ink">{src.title}</h3>}
      {/* The quote is verbatim, in Newsreader with a rule in the relation's color. */}
      <blockquote className={cn('mt-2 border-l-2 pl-3 font-display type-body text-ink', rule)}>
        <p className="line-clamp-6">“{displayQuote(card.quote)}”</p>
      </blockquote>
      {card.locator && <p className="mt-1 type-meta text-ink-3">Where: {card.locator}</p>}
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
            className="inline-flex min-h-6 items-center gap-1 type-meta text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
          >
            Open source
            <ExternalLink aria-hidden="true" className="size-3.5 stroke-[1.5]" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      {(strength || verifier) && (
        <p className="mt-1 type-meta text-ink-2">{[strength, verifier].filter(Boolean).join(' · ')}</p>
      )}
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
  as: Wrapper = 'section',
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
  as?: 'section' | 'div';
}) {
  const shown = filter ? cards.filter((c) => filter.ids.includes(c.evidence_id)) : cards;
  return (
    <Wrapper {...(Wrapper === 'section' ? { 'aria-labelledby': headingId } : {})} className={className}>
      <header className={cn('flex items-baseline justify-between gap-3 pb-3', inSheet && 'sr-only')}>
        <h2 id={headingId} tabIndex={-1} className="type-ui font-semibold text-surface-fg">
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
            onClick={() => {
              onClearFilter();
              // The button disappears with the filter; keep focus in the tray, on its heading.
              requestAnimationFrame(() => document.getElementById(headingId)?.focus());
            }}
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
    </Wrapper>
  );
}

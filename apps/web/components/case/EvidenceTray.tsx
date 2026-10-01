'use client';

import { cn } from 'cn';
import { ExternalLink, Globe } from 'lucide-react';
import { memo, useState } from 'react';
import { PaperclipGlyph } from '@/components/glyphs';
import { usePlayOnce } from './arrival';
import { Roll } from '@/components/ui/roll';
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

const USE_TONE: Record<EvidenceUse['relation'] | 'graphite', string> = {
  graphite: 'text-graphite',
  supports: 'text-support',
  contradicts: 'text-pencil-red',
  missing_context: 'text-ochre',
  framing: 'text-ochre',
  unclear: 'text-ink-2',
};

const RULE_TONE: Record<EvidenceUse['relation'] | 'graphite', string> = {
  graphite: 'border-graphite',
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
  if (!domain || failed) return <Globe aria-hidden="true" className="size-4 shrink-0 stroke-[1.5] text-graphite" />;
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

type CardProps = { card: Card; uses: EvidenceUse[]; n?: number; stopped?: boolean };

const sameUses = (a: EvidenceUse[], b: EvidenceUse[]) =>
  a.length === b.length && a.every((u, i) => u.claimId === b[i].claimId && u.part === b[i].part && u.relation === b[i].relation);

/**
 * A card re-renders only when what it shows changes: every event re-renders the case, and on a phone at 4× CPU
 * throttling re-rendering every card for every event made long tasks (P8 performance gate). `uses` is rebuilt each
 * time, so it is compared by value.
 */
export const EvidenceCard = memo(
  EvidenceCardView,
  (a: CardProps, b: CardProps) => a.card === b.card && a.n === b.n && a.stopped === b.stopped && sameUses(a.uses, b.uses),
);

function EvidenceCardView({ card, uses, n, stopped = false }: CardProps) {
  const src = card.source;
  const store = useLinkStore();
  const link = useLinkState('evidence', card.evidence_id);
  const where = src.domain ?? KIND_WORDS[src.kind];
  const date = published(src.published_at);
  const kinds = new Set(uses.map((u) => u.relation));
  // With no ruling (the run stopped), a challenger's "contradicts" is a finding, not an error: graphite.
  const tone = (r: EvidenceUse['relation']) => (stopped && r === 'contradicts' ? 'graphite' : r);
  const rule = kinds.size === 1 ? RULE_TONE[tone(uses[0].relation)] : 'border-graphite';
  const aged = card.freshness != null && card.freshness < 0.4;
  const strength = strengthWords(card.strength);
  const verifier = card.verifier_status === 'accepted' ? 'Verified' : card.verifier_status === 'rejected' ? 'Could not be verified' : null;
  const lit = () => store.set({ kind: 'evidence', id: card.evidence_id, related: [...new Set(uses.map((u) => u.claimId))] });
  // A card that arrives while you watch rises in and the Clipper's paperclip snaps shut on it (05 §3.4: 2 frames).
  // Both come off once they have played: a list that is hidden and shown again (the desk's tray while the Evidence tab
  // is open) would otherwise restart them. A stored case's cards are simply there.
  const arrived = usePlayOnce(`clip:${card.evidence_id}`);
  const [entered, setEntered] = useState<string[]>([]);
  const snap = arrived && !entered.includes('clip-snap');
  const rise = arrived && !entered.includes('rise-in');
  const off = () => store.set(null);

  return (
    <li
      aria-label={`Source ${n ?? card.evidence_id}${src.title ? `: ${src.title}` : ''}`}
      data-evidence={card.evidence_id}
      data-link={link}
      data-aged={aged || undefined}
      tabIndex={0}
      onPointerEnter={lit}
      onPointerLeave={off}
      onFocus={lit}
      onBlur={off}
      onAnimationEnd={(e) => {
        const n = e.animationName;
        if (n === 'rise-in' || n === 'clip-snap') setEntered((d) => [...d, n]);
      }}
      className={cn(
        'paper relative rounded-card border-(length:--rule) border-sheet-line px-4 pt-4 pb-3 shadow-lift-card',
        rise && 'animate-[rise-in_var(--dur-base)_var(--ease-out)]',
        // In over --dur-quick, out at once: only the dimmed state declares the transition.
        link === 'dimmed' && 'opacity-60 transition-opacity duration-(--dur-quick) motion-reduce:transition-none',
        link === 'active' && 'outline-2 outline-pencil-blue',
        link === 'related' && 'outline-2 outline-ink-3',
      )}
    >
      <PaperclipGlyph data-snap={snap || undefined} className={cn('absolute -top-2 left-3 size-5 text-graphite', snap && 'clip-snap')} />
      <p className="flex flex-wrap items-center gap-x-2 type-meta text-ink-2">
        {n != null && <span className="font-semibold text-ink tabular-nums">Source {n}</span>}
        <Favicon domain={src.domain} />
        <span className="truncate">{where}</span>
        <span className={cn('tabular-nums', !date && 'text-ink-3')}>· {date ? `Published ${date}` : 'Date not given'}</span>
        {aged && <span className="text-ochre">· older source</span>}
        <span className="sr-only">· source {card.evidence_id}</span>
      </p>
      {src.title && <h3 className="mt-1 type-ui font-semibold text-ink">{src.title}</h3>}
      {/* The quote is verbatim, in Newsreader with a rule in the relation's color. */}
      <blockquote className={cn('mt-2 max-w-[68ch] border-l-2 pl-3 font-display type-body text-ink', rule)}>
        <p className="line-clamp-6">“{displayQuote(card.quote)}”</p>
      </blockquote>
      {card.locator && <p className="mt-1 type-meta text-ink-3">Where: {card.locator}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {uses.length > 0 ? (
          <p className="type-meta font-semibold">
            {uses.map((u, i) => (
              <span key={`${u.claimId}-${u.relation}`} className={USE_TONE[tone(u.relation)]}>
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
  stopped = false,
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
  /** The run stopped without a verdict. */
  stopped?: boolean;
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
          <Roll value={cards.length} /> {cards.length === 1 ? 'source' : 'sources'}
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
            className="min-h-6 cursor-pointer text-surface-blue underline decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11"
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
            <EvidenceCard key={c.evidence_id} card={c} uses={usesOf(c.evidence_id)} n={cards.indexOf(c) + 1} stopped={stopped} />
          ))}
        </ol>
      )}
    </Wrapper>
  );
}

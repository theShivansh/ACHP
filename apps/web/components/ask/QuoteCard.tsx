'use client';

import { cn } from 'cn';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { QACitation } from '@/lib/types';
import { matchWords } from '@/lib/qa';

// One passage of a library, quoted verbatim (04 §7 QuoteCard, 07 §6): the excerpt in Newsreader with a rule, which
// chunk it is, and how close a match it was, in words (the number is in the tooltip, never the headline). A `number`
// means the answer cites it as [number]; a card with none is a passage that was retrieved but not cited.

export function QuoteCard({
  citation,
  number,
  active = false,
  cardId,
  className,
}: {
  citation: QACitation;
  number?: number;
  active?: boolean;
  cardId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const long = citation.excerpt.length > 220;
  const expanded = open || active;
  return (
    <li
      id={cardId}
      tabIndex={-1}
      data-quote-card={citation.chunk_index}
      data-active={active || undefined}
      className={cn(
        'paper rounded-card border-(length:--rule) border-sheet-line px-4 py-3 shadow-lift-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        active && 'outline-2 outline-pencil-blue',
        className,
      )}
    >
      <blockquote className="max-w-[68ch] border-l-2 border-graphite pl-3 font-display type-body text-ink">
        <p className={cn(!expanded && long && 'line-clamp-3')}>“{citation.excerpt}”</p>
      </blockquote>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-ink-2">
        {number != null && <span className="font-semibold text-ink">[{number}]</span>}
        <span>Chunk {citation.chunk_index}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="min-h-6 cursor-help rounded-chip underline decoration-dotted decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11">
              {matchWords(citation.score)}
            </button>
          </TooltipTrigger>
          <TooltipContent>Similarity {citation.score.toFixed(2)} on a 0 to 1 scale. Higher is closer.</TooltipContent>
        </Tooltip>
        {long && !active && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="min-h-6 cursor-pointer text-pencil-blue underline decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11"
          >
            {open ? 'Show less' : 'Read the full excerpt'}
          </button>
        )}
      </p>
    </li>
  );
}

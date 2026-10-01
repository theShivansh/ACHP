'use client';

import { useState } from 'react';
import { ScissorsGlyph } from '@/components/glyphs';
import { usePlayOnce } from './arrival';

// The Decomposer's cut (05 §3.4, §5): when the first part is extracted while you watch, a dashed line runs across the
// sheet above the parts (frame 1), its two edges part by 6px (frame 2) and settle (frame 3); then the strips enter
// (globals.css delays them by those three frames). It takes no room, says nothing a screen reader needs (the parts
// heading and the announcer do), and is removed when it ends. Reduced motion: not drawn at all.

export function ScissorsCut() {
  const play = usePlayOnce('scissors-cut');
  // Under reduced motion there is no cut to watch, so it is never drawn (it would never end, either).
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [done, setDone] = useState(false);
  if (!play || reduced) return null;
  // Once cut, an empty hidden marker stays: the strips' entrance is delayed by a sibling rule, and removing it mid-fade
  // would cut that delay and make the strips pop in (P8 motion audit).
  if (done) return <div hidden data-cutting />;
  return (
    <div
      aria-hidden="true"
      data-cutting
      className="pointer-events-none relative h-0"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget.firstElementChild) setDone(true);
      }}
    >
      <svg className="cut absolute inset-x-0 -top-1 h-3 w-full overflow-visible text-ink-2" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <line className="cut-up" x1="0" x2="100%" y1="5" y2="5" strokeDasharray="6 5" />
        <line className="cut-down" x1="0" x2="100%" y1="7" y2="7" strokeDasharray="6 5" />
      </svg>
      <ScissorsGlyph className="absolute -top-2.5 -right-2 size-5 rotate-180 text-ink" />
    </div>
  );
}

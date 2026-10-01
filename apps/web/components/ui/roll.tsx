'use client';

import { useState } from 'react';

/**
 * A count that has just changed (sources found, seconds taken), drawing the eye to it (05 §4, "Numbers"). Only the
 * digits that differ from the last render rise into place (`.roll`, --dur-quick); the others stay put, and nothing
 * is tweened between values, so what is on screen is always a number the log gave us. Counts and durations only:
 * never a score, the overall score or a ledger amount (those update at once; achp-motion §6).
 *
 * The first paint is still, so a stored case opens at rest. `onMount` rolls a value that arrives by mounting, such
 * as a lane's duration settling when it finishes. Characters stay plain text: copying, finding and screen
 * readers see the number as usual.
 */
export function Roll({ value, onMount = false }: { value: string | number; onMount?: boolean }) {
  const text = String(value);
  // The value this one replaced, kept in state (not a ref) so a render is a pure function of its inputs.
  const [shown, setShown] = useState(text);
  const [prev, setPrev] = useState<string | null>(null);
  if (text !== shown) {
    setPrev(shown);
    setShown(text);
  }
  return (
    <span className="tabular-nums">
      {[...text].map((ch, i) => {
        // Compare from the right, so units stay aligned when the number gains a digit (9 → 10).
        const was = prev == null ? undefined : prev[prev.length - (text.length - i)];
        const changed = prev == null ? onMount : was !== ch;
        return (
          // The key holds the place and the character, so a changed digit remounts (and animates) and the rest stay.
          <span key={`${text.length - i}:${ch}`} data-roll={changed ? '' : undefined} className={changed ? 'roll' : undefined}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

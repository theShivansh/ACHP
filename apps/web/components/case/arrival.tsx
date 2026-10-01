'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// When does a handmade moment play? (05 §3, §5.) Only when the event behind it arrives while you watch, and only
// once. A case opened from its stored log is already finished on its first paint: its marks are drawn, its stamps
// pressed, and nothing moves. A strip or a stamp that remounts later (a tab switch, a second copy of the evidence
// list) is the same thing seen again, so it doesn't replay either.
//
// The provider remembers the last seq the first paint already had (the stored head of the log). An element plays
// if it mounts once a later event has arrived and nothing with its key has played yet. The key is marked as played
// after mount, in an effect, so the decision taken during render is stable (StrictMode's double render agrees).

interface Arrival {
  /** The last seq that was already on the first paint. */
  head: number;
  /** The last seq applied now. */
  last: number;
  played: Set<string>;
}

const ArrivalContext = createContext<Arrival | null>(null);

export function ArrivalProvider({ lastSeq, children }: { lastSeq: number; children: React.ReactNode }) {
  const [head] = useState(lastSeq);
  const [played] = useState(() => new Set<string>());
  return <ArrivalContext value={{ head, last: lastSeq, played }}>{children}</ArrivalContext>;
}

/**
 * True when this element should play its arrival (a mark drawing, a stamp pressing) now. Outside an ArrivalProvider
 * (the replay story, the Bench, a unit test) it is false: those show the finished state.
 */
export function usePlayOnce(key: string, enabled = true): boolean {
  const arrival = useContext(ArrivalContext);
  const [play] = useState(() => enabled && arrival != null && arrival.last > arrival.head && !arrival.played.has(key));
  useEffect(() => {
    if (enabled) arrival?.played.add(key);
  }, [arrival, key, enabled]);
  return play;
}

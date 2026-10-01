'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// When does a handmade moment play? (05 §3, §5.) Only when the event behind it arrives while you watch, and only
// once. A case opened from its stored log is already finished on its first paint: its marks are drawn, its stamps
// pressed, and nothing moves. A strip or a stamp that remounts later (a tab switch, a second copy of the evidence
// list) is the same thing seen again, so it doesn't replay either.
//
// The provider remembers the last seq the first paint already had (the stored head of the log). An element plays
// if it mounts once a later event has arrived and nothing with its key has played yet. The key is marked as played
// after mount, in an effect, so the decision taken during render is stable (StrictMode's double render agrees).

interface Arrival {
  /** An event has arrived since the first paint (the log has grown past its stored head). */
  live: boolean;
  played: Set<string>;
  /** The fresh marks boiling now (their keys), for the shared boil budget. */
  boiling: Set<string>;
}

const ArrivalContext = createContext<Arrival | null>(null);

export function ArrivalProvider({ lastSeq, children }: { lastSeq: number; children: React.ReactNode }) {
  const [head] = useState(lastSeq);
  const [played] = useState(() => new Set<string>());
  const [boiling] = useState(() => new Set<string>());
  const live = lastSeq > head;
  // The value changes once (when the first live event lands), so the consumers don't re-render on every event and the
  // memoised strips and cards stay memoised.
  const value = useMemo(() => ({ live, played, boiling }), [live, played, boiling]);
  return <ArrivalContext value={value}>{children}</ArrivalContext>;
}

/**
 * True when this element should play its arrival (a mark drawing, a stamp pressing) now. Outside an ArrivalProvider
 * (the replay story, the Bench, a unit test) it is false: those show the finished state.
 */
export function usePlayOnce(key: string, enabled = true): boolean {
  const arrival = useContext(ArrivalContext);
  const [play] = useState(() => enabled && arrival != null && arrival.live && !arrival.played.has(key));
  useEffect(() => {
    if (enabled) arrival?.played.add(key);
  }, [arrival, key, enabled]);
  return play;
}

/** At most this many elements boil at once, working glyphs and fresh marks together (05 §3.2). */
export const BOIL_LIMIT = 3;

/**
 * Whether a fresh mark may boil: only while the budget has room, counting the working glyphs that boil (`glyphs`) and
 * the marks already boiling. The slot is taken when the mark mounts (adding its key is idempotent, so a repeated render
 * agrees with itself) and given back by `release` when its boil ends or it unmounts.
 */
export function useBoilSlot(key: string, want: boolean, glyphs: number): [boolean, () => void] {
  const arrival = useContext(ArrivalContext);
  const [boil] = useState(() => {
    if (!want || !arrival) return false;
    if (arrival.boiling.has(key)) return true;
    if (glyphs + arrival.boiling.size >= BOIL_LIMIT) return false;
    arrival.boiling.add(key);
    return true;
  });
  useEffect(() => () => void arrival?.boiling.delete(key), [arrival, key]);
  return [boil, () => void arrival?.boiling.delete(key)];
}

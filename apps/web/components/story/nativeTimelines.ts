import { useSyncExternalStore } from 'react';

const QUERY = 'animation-timeline: view()';

/** Does this browser run CSS scroll-driven animations? `true` on the server (the CSS @supports guard decides there). */
export function useNativeTimelines(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports(QUERY),
    () => true,
  );
}

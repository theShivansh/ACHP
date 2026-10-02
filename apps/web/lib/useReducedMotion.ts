import { useSyncExternalStore } from 'react';

// prefers-reduced-motion as React state (05 §6), without pulling a motion library into every page.
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** True when the reader asked for reduced motion. False on the server (the CSS media query still applies there). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches,
    () => false,
  );
}

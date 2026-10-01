'use client';

import { useCallback, useRef } from 'react';

/**
 * The shake of a rejected input (05 §4): three cycles of 4px across --dur-base, then the helper text says what is
 * wrong (the shake points at the problem; the words are the message). The motion is CSS on a `data-shake`
 * attribute (globals.css), which this hook restarts on demand so a second rejection shakes again. It is an attribute,
 * not a class, so a re-render that rewrites `className` cannot wipe it. Under reduced motion it does nothing.
 */
export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const shake = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.removeAttribute('data-shake');
    void el.offsetWidth; // restart the animation if it is already running
    el.setAttribute('data-shake', '');
  }, []);
  const onAnimationEnd = useCallback((e: React.AnimationEvent<T>) => {
    if (e.animationName === 'shake') e.currentTarget.removeAttribute('data-shake');
  }, []);
  return [ref, shake, onAnimationEnd] as const;
}

'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useSyncExternalStore, type ReactNode, type RefObject } from 'react';

// The fallback for the reading gate (05 §2.4). A browser with CSS scroll-driven animations reveals each
// gate line with `animation-timeline` and never renders this. Without them (stock Firefox), each line is
// driven by Motion's useScroll over the gate's own track. Same ranges, same jobs; still no wheel or touch
// listener, and a normal step simply shows its content.

const QUERY = 'animation-timeline: view()';

/** Does this browser run CSS scroll-driven animations? `true` on the server (the CSS @supports guard decides there). */
export function useNativeTimelines(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports(QUERY),
    () => true,
  );
}

export function GateLine({
  i,
  n,
  containerRef,
  className,
  children,
}: {
  /** This line's place among the gate's `n` lines. */
  i: number;
  n: number;
  /** The gate's track (`.story-friction`). */
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  // A line is fully there by the end of its quarter of the track (the native ranges: 0–25, 25–50, 50–75%).
  // Explicit and clamped: once a line is fully revealed it stays revealed to the end of the track.
  const from = i * 0.25;
  const reveal = useTransform(scrollYProgress, (p) => Math.min(1, Math.max(0, (p - from) / 0.25)));
  const opacity = reveal;
  const y = useTransform(reveal, (r) => 16 * (1 - r));
  return (
    <motion.div
      data-gate-line={i}
      data-gate-lines={n}
      style={{ opacity, y }} /* slop-allow: Motion values (not CSS) drive the scroll fallback, 05 §2.4 */
      className={className}
    >
      {children}
    </motion.div>
  );
}

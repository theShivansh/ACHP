'use client';

import { motion, useScroll, useTransform, type MotionValue } from 'motion/react';
import type { ReactNode, RefObject } from 'react';

// The fallback for the reading gate (05 §2.4). A browser with CSS scroll-driven animations reveals each
// gate line with `animation-timeline` and never renders this. Without them (stock Firefox), each line is
// driven by Motion's useScroll over the gate's own track. Same ranges, same jobs; still no wheel or touch
// listener, and a normal step simply shows its content. Loaded only in such a browser (ReplayStory imports it
// dynamically), so Motion never ships to one that runs the CSS.

/**
 * The gate's revealing lines, driven by ONE scroll tracker (not one per line). Each line is fully there by the
 * end of its quarter of the track, the same ranges as the native CSS (0–25%, 25–50%); the strip and its
 * mark-drawing are the gate's first reveal and are not a line.
 */
export function GateLines({
  containerRef,
  className,
  children,
}: {
  /** The gate's track (`.story-friction`). */
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode[];
}) {
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  return (
    <>
      {children.map((c, i) => (
        <GateLine key={i} i={i} n={children.length} progress={scrollYProgress} className={className}>
          {c}
        </GateLine>
      ))}
    </>
  );
}

function GateLine({
  i,
  n,
  progress,
  className,
  children,
}: {
  i: number;
  n: number;
  progress: MotionValue<number>;
  className?: string;
  children: ReactNode;
}) {
  // Explicit and clamped: once a line is fully revealed it stays revealed to the end of the track.
  const from = i * 0.25;
  const reveal = useTransform(progress, (p) => Math.min(1, Math.max(0, (p - from) / 0.25)));
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

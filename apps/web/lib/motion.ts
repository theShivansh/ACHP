// Motion tokens from docs/upgrade/05_MOTION_SPEC.md §1, mirrored from app/globals.css
// for `motion/react`. Durations are in seconds (Motion's unit).

export const dur = {
  instant: 0.09,
  quick: 0.16,
  base: 0.24,
  deliberate: 0.36,
  narrative: 0.6,
} as const;

export const ease = {
  out: [0.2, 0.7, 0.2, 1],
  inOut: [0.6, 0, 0.3, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** A hover waits this long before a definition appears (05 §4); focus shows it at once. Mirrors `--dur-tooltip-delay`. */
export const tooltipDelay = 0.4;

/** How long a copy button says "Copied" before it reverts (05 §4). Display only; never run state. */
export const copiedMs = 1600;

/** One frame at 12fps, for stop-motion (Language C). */
export const fpsStop = 0.083;

/** 4 seeds × 100ms: the line boil period. */
export const boilPeriod = 0.4;

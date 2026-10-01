// The hand in "hand-drawn" (05 §3, 04 §6): deterministic wobble. The same seed always gives the same line, so a
// reload, a second reader and a screenshot all see the same mark. Nothing here reads a clock or Math.random.

/** A deterministic 0..1 sequence from a string (cyrb-style mixing). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** A signed offset in [-amount, amount] from a sequence. */
export function wobbleOf(r: () => number, amount: number): number {
  return (r() - 0.5) * 2 * amount;
}

/**
 * Move every coordinate of an absolute SVG path (M L C Q H V Z only) by up to ±amount px, seeded. Used once, at module
 * load, to bake a pencil's irregularity into the glyphs: the result is a fixed string.
 */
export function jitterPath(d: string, seed: string, amount = 0.6): string {
  if (/[a-z]/.test(d.replace(/e-?\d/g, ''))) throw new Error('jitterPath takes absolute commands only');
  const r = seededRandom(seed);
  return d.replace(/-?\d*\.?\d+/g, (n) => (Number(n) + wobbleOf(r, amount)).toFixed(2).replace(/\.?0+$/, ''));
}

/** The frames a mark takes to draw at 12fps (05 §3.1). */
export const MARK_FRAMES = {
  underline: 6,
  strike: 5,
  bracket: 7,
  tick: 4,
  caret: 4,
  circle: 9,
  /** The highlighter's left → right swipe (05 §3.4). */
  swipe: 5,
} as const;
export type MarkStroke = keyof typeof MARK_FRAMES;

import type { CartoucheShape } from '@/lib/assay/present';

// The cartouche outlines (04 §7.1), in a 28 × 28 box. Shared by the Hallmark component and the share
// image, which draws the same five shapes.

export const W = 28;

export interface Geometry {
  path: string;
  /** Vertical extent of the shape, for the rising fill. */
  top: number;
  bottom: number;
  /** A mark inside the outline (the level's centre tick). */
  extra?: string;
}

export const GEOMETRY: Record<CartoucheShape, Geometry> = {
  shield: { path: 'M14 2 L25 5.5 V14 C25 20 20 24.5 14 26.5 C8 24.5 3 20 3 14 V5.5 Z', top: 2, bottom: 26.5 },
  hexagon: { path: 'M14 2.5 L24.5 8.25 V19.75 L14 25.5 L3.5 19.75 V8.25 Z', top: 2.5, bottom: 25.5 },
  diamond: { path: 'M14 2 L26 14 L14 26 L2 14 Z', top: 2, bottom: 26 },
  level: { path: 'M3.5 8 H24.5 Q26 8 26 9.5 V18.5 Q26 20 24.5 20 H3.5 Q2 20 2 18.5 V9.5 Q2 8 3.5 8 Z', top: 8, bottom: 20, extra: 'M14 8 V12' },
  circle: { path: 'M14 2.5 A11.5 11.5 0 1 1 13.99 2.5 Z', top: 2.5, bottom: 25.5 },
};

import { jitterPath } from '@/lib/handdrawn';

// The hand-drawn glyph set (04 §6, §8; 05 §3). Each glyph is one stroked path on a 24px grid, drawn by hand in
// absolute coordinates, then every control point is moved by up to ±0.6px with a fixed seed (its name), so the
// line looks pencilled and is identical on every load. The wobble is computed once, when this module loads.

const BASE = {
  /** Wax seal: a scalloped edge where the wax spread, a drip, and the pressed ring inside it. */
  seal:
    'M12 3.2 Q15.3 2.4 17.3 5.1 Q20.3 6.6 20.1 10 Q21.5 13.1 19.1 15.5 Q18.2 18.8 14.8 19.1 Q12 21 9.2 19.1 Q5.8 18.8 4.9 15.5 Q2.5 13.1 3.9 10 Q3.7 6.6 6.7 5.1 Q8.7 2.4 12 3.2 Z ' +
    'M16.2 19.2 C16.8 20.4 16.6 21.3 15.7 21.6 ' +
    'M12 7.8 C14.1 7.8 15.6 9.4 15.6 11.4 C15.6 13.4 14 15 12 15 C10 15 8.4 13.4 8.4 11.4 C8.4 9.4 10 7.8 12 7.8 Z',
  /** Paperclip: one wire, two bends. */
  paperclip:
    'M15.8 7.2 L8.9 14.1 C8 15 8.1 16.3 8.9 17.1 C9.8 17.9 11 17.9 11.9 17 L19.3 9.6 C21 7.9 20.9 5.4 19.3 3.8 C17.7 2.2 15.1 2.1 13.4 3.8 L5.9 11.3 C3.5 13.7 3.6 17.4 5.9 19.7 C8.2 21.9 11.8 22 14.2 19.6 L20.2 13.6',
  /** Scissors: two finger loops, two crossed blades. */
  scissors:
    'M6.2 3.9 C7.8 3.8 9 5.1 9 6.6 C9 8.2 7.7 9.4 6.2 9.4 C4.6 9.4 3.4 8.1 3.5 6.6 C3.5 5.1 4.7 3.9 6.2 3.9 Z ' +
    'M6.2 14.6 C7.8 14.5 9 15.8 9 17.3 C9 18.9 7.7 20.1 6.2 20.1 C4.6 20.1 3.4 18.8 3.5 17.3 C3.5 15.8 4.7 14.6 6.2 14.6 Z ' +
    'M8.5 8.2 L20.3 18.6 M8.5 15.8 L20.3 5.4',
  /** Red pencil: freshly sharpened, the cut of the cone drawn across the barrel and the lead shaded. */
  redPencil:
    'M15.6 4.3 C16.4 3.5 17.7 3.4 18.5 4.2 L19.8 5.5 C20.6 6.3 20.6 7.6 19.7 8.4 L8.6 19.5 L4 20.1 L4.5 15.6 Z M6.4 13.8 L10.3 17.7 M5.3 17.4 L6.7 18.8',
  /** Blue pencil: a wide metal band near the top and no sharpened cone, so the two pencils differ in shape, not only in
   *  ink (P8 design review: colour alone doesn't separate them for every reader). */
  bluePencil:
    'M15.6 4.3 C16.4 3.5 17.7 3.4 18.5 4.2 L19.8 5.5 C20.6 6.3 20.6 7.6 19.7 8.4 L8.6 19.5 L4 20.1 L4.5 15.6 Z M14.2 5.8 L18.2 9.8 M12.1 7.9 L16.1 11.9',
  /** Highlighter: a chisel-tipped marker and the stroke it left. */
  highlighter:
    'M9.1 14.9 L15.8 4.8 C16.4 3.9 17.7 3.7 18.6 4.3 L19.5 4.9 C20.4 5.5 20.6 6.7 20 7.6 L13.3 17.7 M9.1 14.9 L13.3 17.7 L11.7 20.1 L7.4 19.7 Z M3.8 20.6 L10.2 20.6',
  /** Rubber stamp: handle, block, and the line it prints. */
  stamp:
    'M9.6 12.3 L9.6 9.4 C8.4 8.7 7.6 7.4 7.6 6 C7.7 3.7 9.6 2 12 2 C14.3 2 16.3 3.8 16.3 6 C16.3 7.5 15.5 8.8 14.3 9.4 L14.3 12.3 ' +
    'M4.3 12.4 L19.6 12.4 C20.2 12.4 20.6 12.9 20.6 13.4 L20.6 16.3 L3.3 16.3 L3.3 13.4 C3.3 12.9 3.7 12.4 4.3 12.4 Z M5.2 20.2 L18.9 20.2',
  /** Loupe: a glass and its handle. */
  loupe:
    'M10.4 3.6 C14.2 3.5 17.2 6.6 17.2 10.4 C17.2 14.2 14.1 17.3 10.4 17.2 C6.6 17.2 3.6 14.2 3.6 10.4 C3.7 6.6 6.6 3.6 10.4 3.6 Z M15.4 15.5 L20.6 20.5',
  /** Crop corners: two L-shaped rules. */
  crop: 'M6.3 2.8 L6.3 17.4 C6.3 17.9 6.6 18.2 7.1 18.2 L21.2 18.2 M2.8 6.4 L16.9 6.4 C17.4 6.4 17.7 6.7 17.7 7.2 L17.7 21.2',
  /** Lamp: a bulb and its base, for the cold start. */
  lamp:
    'M12 3.2 C15.3 3.2 17.6 5.7 17.6 8.8 C17.6 11 16.4 12.4 15.2 13.6 C14.6 14.2 14.4 14.9 14.4 15.8 L9.6 15.8 C9.6 14.9 9.4 14.2 8.8 13.6 C7.6 12.4 6.4 11 6.4 8.8 C6.4 5.7 8.7 3.2 12 3.2 Z M9.8 18.2 L14.2 18.2 M10.6 20.6 L13.4 20.6',
  /** An agent the client doesn't know yet: a plain ring. */
  dot: 'M12 8.2 C14.1 8.2 15.8 9.9 15.8 12 C15.8 14.1 14.1 15.8 12 15.8 C9.9 15.8 8.2 14.1 8.2 12 C8.2 9.9 9.9 8.2 12 8.2 Z',
} as const;

export type GlyphName = keyof typeof BASE;

export const GLYPH_PATHS = Object.fromEntries(
  Object.entries(BASE).map(([name, d]) => [name, jitterPath(d, `glyph:${name}`, 0.6)]),
) as Record<GlyphName, string>;

/** The un-wobbled drawings, for the tests (the wobble stays within ±0.6px of these). */
export const GLYPH_BASE: Record<GlyphName, string> = BASE;

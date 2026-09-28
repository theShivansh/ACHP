// Span marks v1 (P3): turn a character span of a strip into the boxes it covers on screen.
// The span arrives from the server as [start, end) offsets into the strip's text (claim.marked).
// A DOM Range over the strip's single text node gives one client rect per line fragment; we merge
// the fragments line by line so a mark that wraps gets one rect per line (S3.5).

export interface MarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A span clamped to the text; null when nothing of it is left (bad or empty span). */
export function clampSpan(span: readonly [number, number], length: number): [number, number] | null {
  const [a, b] = span;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const start = Math.max(0, Math.min(length, Math.floor(a)));
  const end = Math.max(0, Math.min(length, Math.floor(b)));
  return end > start ? [start, end] : null;
}

/**
 * Merge a Range's client rects into one rect per line, relative to `origin` (the strip's text box).
 * Fragments on the same line (inline boxes split by the browser) overlap vertically; zero-width
 * fragments (line ends) are dropped. Lines come back top to bottom.
 */
export function lineRects(rects: Iterable<RectLike>, origin: { left: number; top: number }): MarkRect[] {
  const lines: { top: number; bottom: number; left: number; right: number }[] = [];
  for (const r of rects) {
    if (r.width <= 0.5 || r.height <= 0) continue;
    const top = r.top;
    const bottom = r.top + r.height;
    const mid = (top + bottom) / 2;
    const line = lines.find((l) => mid >= l.top && mid <= l.bottom);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.left + r.width);
      line.top = Math.min(line.top, top);
      line.bottom = Math.max(line.bottom, bottom);
    } else {
      lines.push({ top, bottom, left: r.left, right: r.left + r.width });
    }
  }
  return lines
    .sort((a, b) => a.top - b.top)
    .map((l) => ({
      x: round(l.left - origin.left),
      y: round(l.top - origin.top),
      width: round(l.right - l.left),
      height: round(l.bottom - l.top),
    }));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The rects of `span` inside `text` (a Text node), relative to `container`. */
export function measureSpan(text: Text, span: readonly [number, number], container: Element): MarkRect[] {
  const s = clampSpan(span, text.length);
  if (!s) return [];
  const range = text.ownerDocument.createRange();
  range.setStart(text, s[0]);
  range.setEnd(text, s[1]);
  const box = container.getBoundingClientRect();
  return lineRects(Array.from(range.getClientRects()), box);
}

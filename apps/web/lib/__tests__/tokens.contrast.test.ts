import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads the real token values from app/globals.css and checks the WCAG AA pairs from
// docs/upgrade/04_DESIGN.md §3 (plus the chart tokens, §7.2) in both themes.

const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = block(':root');
const darkOverrides = block(':root[data-theme="dark"]');
const dark = { ...light, ...darkOverrides };

type RGB = [number, number, number];
function hex(value: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m) throw new Error(`not a 6-digit hex: ${value}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as RGB;
}
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** The highlighter as painted: the fill blended onto the sheet, then mixed at its opacity. */
function highlighted(t: Record<string, string>): RGB {
  const s = hex(t.sheet);
  const h = hex(t.highlighter);
  const a = Number(t['highlighter-opacity']);
  const blend = t['highlighter-blend'] === 'screen'
    ? (x: number, y: number) => 1 - (1 - x) * (1 - y)
    : (x: number, y: number) => x * y;
  return s.map((sc, i) => sc * (1 - a) + blend(sc, h[i]) * a) as RGB;
}

const TEXT = 4.5; // AA body text
const NON_TEXT = 3; // AA UI components and graphical objects (focus rings, chart marks)

// [foreground, background, minimum]
const pairs: Array<[string, string, number]> = [
  ['desk-ink', 'desk', TEXT],
  ['desk-ink-2', 'desk', TEXT],
  ['desk-ink', 'desk-raised', TEXT],
  ['desk-ink-2', 'desk-raised', TEXT],
  ['ink', 'sheet', TEXT],
  ['ink-2', 'sheet', TEXT],
  ['ink-3', 'sheet', TEXT],
  ['pencil-red', 'sheet', TEXT],
  ['pencil-blue', 'sheet', TEXT],
  ['support', 'sheet', TEXT],
  ['ochre', 'sheet', TEXT],
  ['graphite', 'sheet', TEXT],
  // Accents used on the desk chrome (chips, links, status dots)
  ...(['desk-red', 'desk-blue', 'desk-support', 'desk-ochre', 'desk-graphite'] as const).flatMap(
    (fg) => (['desk', 'desk-raised'] as const).map((bg): [string, string, number] => [fg, bg, TEXT]),
  ),
  ['focus', 'desk', NON_TEXT],
  ['focus', 'desk-raised', NON_TEXT],
  ['pencil-blue', 'sheet', NON_TEXT], // the focus ring on paper
  ['on-pencil-blue', 'pencil-blue', TEXT], // the primary button
  ['mark-credit', 'sheet', NON_TEXT],
  ['mark-debit', 'sheet', NON_TEXT],
  ['mark-neutral', 'sheet', NON_TEXT],
  ['mark-focus', 'sheet', NON_TEXT],
];

// The ratios 04 §3.1 publishes for the light theme; the parsed values must reproduce them.
const published: Array<[string, string, number]> = [
  ['desk-ink', 'desk', 13.2],
  ['desk-ink-2', 'desk', 7.2],
  ['ink', 'sheet', 16.3],
  ['ink-2', 'sheet', 7.1],
  ['ink-3', 'sheet', 5.0],
  ['pencil-red', 'sheet', 5.7],
  ['pencil-blue', 'sheet', 6.2],
  ['support', 'sheet', 5.5],
  ['ochre', 'sheet', 5.4],
  ['graphite', 'sheet', 5.6],
  ['focus', 'desk', 6.7],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme tokens', (_name, t) => {
  it.each(pairs)('%s on %s meets %s:1', (fg, bg, min) => {
    expect(ratio(hex(t[fg]), hex(t[bg]))).toBeGreaterThanOrEqual(min);
  });

  it('ink on the highlighter (as blended onto the sheet) meets AA', () => {
    expect(ratio(hex(t.ink), highlighted(t))).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('light theme matches the ratios published in 04 §3.1', () => {
  it.each(published)('%s on %s ≈ %s:1', (fg, bg, expected) => {
    // The doc rounds to one decimal, so allow ±0.1.
    expect(Math.abs(ratio(hex(light[fg]), hex(light[bg])) - expected)).toBeLessThanOrEqual(0.1);
  });
});

describe('token coverage', () => {
  it('the dark theme overrides the same tokens under prefers-color-scheme and [data-theme]', () => {
    const media = block(':root:not([data-theme="light"])');
    expect(media).toEqual(darkOverrides);
  });
});

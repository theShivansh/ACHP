import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Motion token hygiene (05 §1, P7): no durations or easings written out in the product's code. They come from
// the --dur-* and --ease-* tokens (CSS) or lib/motion.ts (Motion). The legacy single-page UI is retired in P9 and
// is not scanned. Every exception is listed here with its reason.

const ROOT = path.resolve(__dirname, '..', '..');
const LEGACY = [
  'app/page.tsx',
  'app/legacy.css',
  'components/KBManager.tsx',
  'components/TopBar.tsx',
  'components/Sidebar.tsx',
  'components/QueryInput.tsx',
  'components/RAGAnswer.tsx',
  'components/PipelineProgress.tsx',
  'components/PipelineTimeline.tsx',
  'components/VerdictCard.tsx',
  'components/TransparencyReport.tsx',
  'components/PerspectivePanel.tsx',
  'components/AtomicClaims.tsx',
];
const SKIP = /(__tests__|\.test\.|node_modules|\.next)/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (SKIP.test(p)) return [];
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

/** A line that sets a duration, delay or easing. */
const TIMING_LINE =
  /(animation|transition)(-duration|-delay|-timing-function)?\s*:|animate-\[|duration-|delay-|ease-|cubic-bezier|\bduration:|\bdelay:|\bease:/;
/** A timing written out in full. */
const LITERAL =
  /(\d*\.?\d+)(ms|s)\b|cubic-bezier\(|\bduration-\d|\bdelay-\d|\bduration-\[|\bdelay-\[|\bease-in(?![-\w])|\bease-linear|\btransition-all\b|\bduration:\s*[\d.]|\bdelay:\s*[\d.]/;

/** Where a literal is the spec's own number, with the reason. */
const ALLOWED: { file: string; text: RegExp; why: string }[] = [
  { file: 'app/globals.css', text: /^\s*--(dur|ease|fps|boil|lamp)[-\w]*:/, why: 'the token definitions (05 §1, §3.4)' },
  { file: 'app/globals.css', text: /animation-duration:\s*120ms/, why: '05 §6: a reduced-motion crossfade is at most 120ms' },
  { file: 'lib/motion.ts', text: /.*/, why: 'the mirror of the tokens for motion/react' },
];

describe('motion tokens', () => {
  const all = ['app', 'components', 'lib'].flatMap((d) => files(path.join(ROOT, d))).filter((f) => !LEGACY.includes(rel(f)));

  it('scans the product code', () => {
    expect(all.length).toBeGreaterThan(40);
  });

  it('writes no duration, delay or easing out in full', () => {
    const hits: string[] = [];
    for (const f of all) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!TIMING_LINE.test(line)) return;
          const bare = line.replace(/var\([^)]*\)/g, '').replace(/calc\([^)]*\)/g, '').replace(/\b0ms\b|\b0s\b/g, '');
          if (!LITERAL.test(bare)) return;
          // Prose and doc comments that mention a number are not timing.
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (ALLOWED.some((a) => a.file === rel(f) && a.text.test(line))) return;
          hits.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 120)}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

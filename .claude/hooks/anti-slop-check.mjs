#!/usr/bin/env node
// ACHP anti-slop gate — deterministic checks for banned UI patterns (docs/upgrade/04_DESIGN.md §2).
//
// Modes
//   Hook (PostToolUse on Edit|Write|MultiEdit): reads the hook JSON on stdin, checks the edited file.
//     Exit 2 + stderr report when violations exist, so Claude sees them and fixes them immediately.
//   Full scan:   node .claude/hooks/anti-slop-check.mjs --all [--summary]      (reports everything: the burn-down view)
//   Given files: node .claude/hooks/anti-slop-check.mjs path/a.tsx path/b.css
//
// Hook and given-file modes report only NEW hits: lines whose (rule, text) pair isn't already present in the
// file's HEAD version. Legacy code you touch doesn't flood the report; anything you introduce is caught.
// Add --strict to report every hit in the given files.
//
// Escape hatch: put `slop-allow: <reason>` in a comment on the same line (and log it in PROGRESS.md).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const WEB = path.join(ROOT, 'apps', 'web');
const EXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.css']);
const SKIP_DIRS = /(node_modules|\.next|\/e2e\/|__tests__|\/fixtures\/|\/public\/|\.test\.|\.spec\.)/;

const RULES = [
  { id: 'neon-cyan', re: /00F0FF|0,\s*240,\s*255/i, hint: 'Neon cyan belongs to the old UI. Use the tokens (--pencil-blue for links and focus).' },
  { id: 'glow-shadow', re: /box-shadow:\s*0\s+0\s+\d{2,}px|boxShadow:\s*['"`]0\s+0\s+\d{2,}px|shadow-\[0_0_\d/, hint: 'No glow. Paper casts --lift-sheet/--lift-card; UI casts nothing.' },
  { id: 'glass', re: /backdrop-filter|backdropFilter|backdrop-blur/, hint: 'No glassmorphism (only the sticky mobile header may use ≤8px blur: mark it slop-allow).' },
  { id: 'grid-backdrop', re: /grid-backdrop|linear-gradient\(to right,\s*rgba\(255,\s*255,\s*255/, hint: 'No grid or dot page backdrops. The desk is a flat slate; the sheet has grain.' },
  { id: 'gradient-text', re: /bg-clip-text|background-clip:\s*text|backgroundClip:\s*['"]text/, hint: 'No gradient text.' },
  { id: 'purple-gradient', re: /(from|via|to)-(purple|violet|fuchsia|indigo)-\d|#A100F0|161,\s*0,\s*240/i, hint: 'No purple/violet gradients or accents.' },
  { id: 'banned-font', re: /['"`]Inter['"`]|\bInter\(|family=Inter|Space[ +_]Grotesk|JetBrains[ +_]Mono|['"`]Roboto['"`]|\bArial\b/, hint: 'Fonts: Newsreader (claims), Public Sans (UI), Kalam (notes), IBM Plex Mono (code only).' },
  { id: 'icon-font', re: /material-symbols|Material\+Symbols/, hint: 'No icon fonts. Use the hand-drawn glyphs or Lucide.' },
  { id: 'mono-label', re: /\bfont-mono\b|fontFamily:\s*['"`][^'"`]*Mono/, allowPath: /(trace|Trace|CodeBlock|developers|\.css$)/, hint: 'Monospace only in code blocks and raw JSON (Trace, /developers).' },
  { id: 'caps-tracking', re: /uppercase[^"'`\n]*tracking-(wide|wider|widest|\[0\.(0[8-9]|[1-9]))|tracking-(wide|wider|widest|\[0\.(0[8-9]|[1-9]))[^"'`\n]*uppercase|letterSpacing:\s*['"]0\.(0[8-9]|[1-9])/, allowPath: /Stamp/, hint: 'No wide-tracked caps labels (stamps excepted). Use sentence case Public Sans 500.' },
  { id: 'pill-button', re: /<(Button|button)\b[^>]*rounded-full/, hint: 'Buttons are 6px radius. No pills.' },
  { id: 'infinite-anim', re: /animation:[^;\n]*infinite|animate-(pulse|ping|spin|bounce)\b|repeat:\s*Infinity/, hint: 'Only .boil on a working lane and the cold-start lamp may loop (mark slop-allow in those two places).' },
  { id: 'bounce-ease', re: /cubic-bezier\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*1\.[1-9]|['"]easeOutBack['"]|type:\s*['"]spring['"][^}\n]*bounce:\s*0\.[3-9]|\belastic\b/i, hint: 'No bounce or elastic easing. Use --ease-out / --ease-in-out.' },
  { id: 'cream-bg', re: /#(F5F0E8|FAF7F2|FDF6E3|F5F5DC|FFF8E7|FAF3E0|FBF7F0|F7F3EA|FFFBEB|FEFCE8)\b|bg-(amber|stone|orange|yellow)-50\b/i, hint: 'No cream/beige/warm off-white. The sheet is --sheet (#F3F5F6, cool).' },
  { id: 'pure-bw', re: /#000000\b|#000\b(?![0-9a-f])|#fff\b(?![0-9a-f])|#ffffff\b|bg-black\b|bg-white\b/i, hint: 'Tint every neutral: use --ink / --sheet / --desk tokens.' },
  { id: 'js-hover', re: /onMouseEnter=\{/, hint: 'No JS hover styling. Use CSS :hover plus :focus-visible (onPointerEnter is fine for non-style logic).' },
  { id: 'inline-style', re: /style=\{\{(?!\s*['"]--)/, allowPath: /(opengraph-image|icon\.tsx|apple-icon)/, hint: 'No inline style objects (CSS custom properties like style={{"--len": n}} are fine).' },
  { id: 'hardcoded-model', re: /DeepSeek|Llama|Qwen|gpt-oss|OpenRouter/, onlyPath: /(components\/|app\/\(desk\)|app\/.*page\.tsx)/, hint: 'Model names come from run.started.agents[] at runtime.' },
  { id: 'no-audio', re: /AudioContext|webkitAudioContext|new Audio\(|<audio\b|from ['"](use-sound|howler|@inklu\/audio|@thenormvg\/web-have-sounds)['"]|\.(mp3|wav|ogg|m4a)['"`]/, hint: 'ACHP is silent: no UI sounds, no audio files, no sound toggle (02 non-goals, 05 §4.1).' },
  { id: 'radar-chart', re: /\bRadarChart\b|\bPolarGrid\b|MetricsRadar|from ['"]recharts['"].*Radar/, hint: 'No radar for CTS/PCS/BIS/NSS/EPS. Use the Assay Hallmark (11 §3.1).' },
  { id: 'fake-progress', re: /buildDetailedLogs|AGENT \d+\/11|progressPulse|Math\.min\(target,\s*92\)|creep/i, hint: 'Synthetic progress and fabricated logs are banned (06 §1).' },
];

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next|\.git/.test(e.name)) out.push(...listFiles(p)); }
    else if (EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function headVersion(rel) {
  try { return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); }
  catch { return null; }
}

function check(file, { onlyNew = false } = {}) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (!rel.startsWith('apps/web/') || SKIP_DIRS.test('/' + rel) || !EXT.has(path.extname(file))) return [];
  if (!fs.existsSync(file)) return [];
  const hits = scan(rel, fs.readFileSync(file, 'utf8'));
  if (!onlyNew) return hits;
  const head = headVersion(rel);
  if (head == null) return hits;               // new file: everything is new
  const old = new Map();
  for (const h of scan(rel, head)) { const k = h.id + '|' + h.text; old.set(k, (old.get(k) || 0) + 1); }
  return hits.filter(h => { const k = h.id + '|' + h.text; const n = old.get(k) || 0; if (n > 0) { old.set(k, n - 1); return false; } return true; });
}

function scan(rel, content) {
  const lines = content.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (line.includes('slop-allow')) return;
    for (const r of RULES) {
      if (r.onlyPath && !r.onlyPath.test(rel)) continue;
      if (r.allowPath && r.allowPath.test(rel)) continue;
      if (r.re.test(line)) hits.push({ rel, line: i + 1, id: r.id, hint: r.hint, text: line.trim().slice(0, 110) });
    }
  });
  return hits;
}

function report(hits, summaryOnly) {
  if (!hits.length) return;
  if (summaryOnly) {
    const by = {};
    for (const h of hits) by[h.id] = (by[h.id] || 0) + 1;
    process.stderr.write(`anti-slop: ${hits.length} violations\n` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k.padEnd(16)} ${v}`).join('\n') + '\n');
    return;
  }
  const byRule = {};
  for (const h of hits) (byRule[h.id] ||= []).push(h);
  let msg = strict
    ? `anti-slop: ${hits.length} banned-pattern hit(s) (see docs/upgrade/04_DESIGN.md §2):\n`
    : `anti-slop: ${hits.length} new banned-pattern hit(s) in what you just wrote. Fix them now (see docs/upgrade/04_DESIGN.md §2):\n`;
  for (const [id, hs] of Object.entries(byRule)) {
    msg += `\n[${id}] ${hs[0].hint}\n`;
    for (const h of hs.slice(0, 8)) msg += `  ${h.rel}:${h.line}  ${h.text}\n`;
    if (hs.length > 8) msg += `  …and ${hs.length - 8} more\n`;
  }
  process.stderr.write(msg);
}

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
let files = [];

if (args.includes('--all')) {
  files = listFiles(WEB);
} else if (args.filter(a => !a.startsWith('--')).length) {
  files = args.filter(a => !a.startsWith('--')).map(a => path.resolve(ROOT, a));
} else {
  // Hook mode: JSON on stdin
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const fp = input?.tool_input?.file_path || input?.tool_input?.path;
  if (!fp) process.exit(0);
  files = [path.isAbsolute(fp) ? fp : path.resolve(ROOT, fp)];
}

const strict = args.includes('--strict') || args.includes('--all');
const hits = files.flatMap(f => check(f, { onlyNew: !strict }));
report(hits, summaryOnly);
process.exit(hits.length ? 2 : 0);

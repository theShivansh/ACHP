#!/usr/bin/env node
// Honesty checks (09 §5): greps that fail the build when the UI could fake work, progress or a verdict.
//   node scripts/honesty-check.mjs        (or bash scripts/honesty-check.sh)
// Node rather than ripgrep so it runs the same on every machine and in CI. Exit 1 on any match.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');
const SKIP = /[\\/](node_modules|\.next|\.lighthouseci|test-results|playwright-report|coverage)[\\/]?/;
const CODE = /\.(tsx?|jsx?|mjs|css)$/;

function walk(dir, keep = () => true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p + (e.isDirectory() ? path.sep : ''))) continue;
    if (e.isDirectory()) out.push(...walk(p, keep));
    else if (CODE.test(e.name) && keep(p)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');
const isTest = (p) => /(__tests__|[\\/]e2e[\\/]|\.test\.|\.spec\.)/.test(p);
let failed = 0;

function check(name, re, files) {
  const hits = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => re.test(line) && hits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 140)}`));
  }
  if (hits.length) {
    failed++;
    console.log(`✗ honesty: ${name}`);
    for (const h of hits) console.log(`  ${h}`);
  } else console.log(`✓ ${name}`);
}

const ui = [...walk(path.join(WEB, 'components')), ...walk(path.join(WEB, 'app'), (p) => !/[\\/]app[\\/]api[\\/]/.test(p))].filter((p) => !isTest(p));
const product = walk(WEB).filter((p) => !isTest(p));
// A check that scanned nothing proves nothing.
if (ui.length < 50 || product.length < 100) {
  console.log(`✗ honesty: scanned too few files (${ui.length} UI, ${product.length} product); is the path right?`);
  process.exit(1);
}
console.log(`scanning ${ui.length} UI files and ${product.length} product files`);

// Model names come from run.started (CLAUDE.md rule 3); server route handlers may name the models they call.
check('no hard-coded model names in UI components', /DeepSeek|Llama|Qwen|gpt-oss|OpenRouter/, ui);
// The old UI built fake logs and a fake progress bar (01_AUDIT).
check('no fabricated log builders', /buildDetailedLogs|AGENT [0-9]+\/11/, product);
check('no synthetic progress', /progressPulse|Math\.min\(target, ?92\)|\bcreep\b/, product);
// The Sharer's view states verdicts in words, never as a percentage (the rendered-text test covers computed strings).
check('no percentage helpers in the case view', /\bpct\(|toFixed\(\d\)\s*\+\s*['"]%/, walk(path.join(WEB, 'components', 'case')).filter((p) => !isTest(p)));

// Fixture replays (the only non-live runs) answer only in development and test, or with ACHP_FIXTURES=1 (rule 4).
const fixtures = path.join(WEB, 'lib', 'runs', 'fixtures.ts');
const route = path.join(WEB, 'app', 'api', 'dev', 'fixture', '[name]', '[[...path]]', 'route.ts');
const guarded =
  fs.existsSync(fixtures) &&
  /export function fixtureEnabled[\s\S]{0,400}(NODE_ENV|ACHP_FIXTURES)/.test(fs.readFileSync(fixtures, 'utf8')) &&
  fs.existsSync(route) &&
  /fixtureEnabled\(\)/.test(fs.readFileSync(route, 'utf8'));
if (!guarded) {
  failed++;
  console.log('✗ honesty: the fixture replay route is not guarded by fixtureEnabled()');
} else console.log('✓ fixture replays are guarded (development, test or ACHP_FIXTURES=1 only)');

// No legacy mock endpoint may come back.
if (fs.existsSync(path.join(WEB, 'app', 'api', 'analyze'))) {
  failed++;
  console.log('✗ honesty: app/api/analyze (the legacy mock proxy) exists again');
} else console.log('✓ no legacy mock proxy');

process.exit(failed ? 1 : 0);

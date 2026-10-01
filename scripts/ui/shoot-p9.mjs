#!/usr/bin/env node
// P9 captures: every route of the full site (07 §1) in the states a reviewer needs, at 1440, 390 and 360 wide, light and
// dark, and a phone with reduced motion. The backend is mocked in the browser (health, libraries, chunks, Q&A, stored
// runs), so the pages render with believable data and nothing here reaches a real server.
//
//   node scripts/ui/shoot-p9.mjs [--phase P9] [--base http://localhost:3000] [--only desk,ask] [--home /]
//
// Output: docs/upgrade/screens/<phase>/<state>-<viewport>-<theme>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const phase = flag('phase', 'P9');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const only = flag('only', '').split(',').filter(Boolean);
const home = flag('home', '/');
const outDir = path.resolve(process.cwd(), 'docs/upgrade/screens', phase);
fs.mkdirSync(outDir, { recursive: true });
const WEB = path.resolve(process.cwd(), 'apps/web');

const SETS = [
  { name: 'desktop-light', viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false, scheme: 'light', reduced: false },
  { name: 'desktop-dark', viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false, scheme: 'dark', reduced: false },
  { name: 'mobile-light', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true, scheme: 'light', reduced: false },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true, scheme: 'dark', reduced: false },
  { name: 'mobile360-light', viewport: { width: 360, height: 740 }, dpr: 2, mobile: true, scheme: 'light', reduced: false },
  { name: 'mobile-light-reduced', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true, scheme: 'light', reduced: true },
];

const KBS = {
  total: 3,
  knowledge_bases: [
    { kb_id: 'kb1', name: 'Health KB', source_type: 'file', source_name: 'who-physical-activity.pdf', doc_count: 3, chunk_count: 48, size_bytes: 120000, status: 'ready', created_at: '2026-09-01', tags: [] },
    { kb_id: 'kb2', name: 'Climate reports', source_type: 'url', source_name: 'https://example.org/climate', doc_count: 5, chunk_count: 210, size_bytes: 2400000, status: 'indexing', created_at: '2026-09-02', tags: [] },
    { kb_id: 'kb3', name: 'Old notes', source_type: 'text', source_name: 'pasted text', doc_count: 1, chunk_count: 0, size_bytes: 0, status: 'error', created_at: '2026-09-02', tags: [] },
  ],
};
const CHUNKS = {
  kb_id: 'kb1', name: 'Health KB', chunk_count: 3,
  chunks: [
    { index: 0, char_count: 312, text: 'Adults aged 18 to 64 should do at least 150 minutes of moderate-intensity aerobic physical activity throughout the week, or at least 75 minutes of vigorous-intensity activity, or an equivalent combination.' },
    { index: 1, char_count: 280, text: 'For additional health benefits, adults should increase their moderate-intensity aerobic physical activity to 300 minutes per week. Muscle-strengthening activities on two or more days a week are also recommended.' },
    { index: 2, char_count: 190, text: 'Older adults with poor mobility should do physical activity to enhance balance and prevent falls on three or more days per week.' },
  ],
};
const QA_OK = {
  run_id: 'qa1', question: 'How much exercise does WHO recommend per week?', kb_id: 'kb1', kb_name: 'Health KB', latency_ms: 812,
  answer: 'Adults should do at least 150 minutes of moderate-intensity activity a week [0]. More, up to 300 minutes, brings added benefit [1].',
  citations: [
    { chunk_index: 0, score: 0.71, excerpt: CHUNKS.chunks[0].text },
    { chunk_index: 1, score: 0.52, excerpt: CHUNKS.chunks[1].text },
    { chunk_index: 2, score: 0.31, excerpt: CHUNKS.chunks[2].text },
  ],
};
const QA_OUT = {
  run_id: 'qa2', question: 'Who won the 1998 football World Cup?', kb_id: 'kb1', kb_name: 'Health KB', latency_ms: 700,
  answer: 'The knowledge base does not contain information about this.',
  citations: [
    { chunk_index: 2, score: 0.22, excerpt: CHUNKS.chunks[2].text },
    { chunk_index: 0, score: 0.18, excerpt: CHUNKS.chunks[0].text },
    { chunk_index: 1, score: 0.15, excerpt: CHUNKS.chunks[1].text },
  ],
};

const LOGS = { quiet: 'synthetic-quiet-falsehood', loud: 'synthetic-loud-falsehood', loaded: 'synthetic-true-but-loaded', mixed: 'synthetic-mixed', blocked: 'synthetic-blocked' };
const readLog = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const synthetic = (k) => readLog(`${WEB}/lib/runs/__tests__/logs/${LOGS[k]}.jsonl`);
const RUN_IDS = Object.fromEntries(Object.keys(LOGS).map((k) => [`r_${k}_0001`, k]));

async function mock(ctx, { runs = false, libraries = true, wake = false } = {}) {
  const cors = { 'access-control-allow-origin': '*' };
  // A cross-origin JSON POST is preflighted: answer the OPTIONS request, then the real one.
  const answer = (r, json) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
      : r.fulfill({ json, headers: cors });
  await ctx.route('**/health', async (r) => {
    if (wake) return; // never answers: the desk is waking
    await answer(r, { status: 'ok' });
  });
  if (libraries) {
    await ctx.route(/\/kb\/list$/, (r) => answer(r, KBS));
    await ctx.route(/\/kb\/kb1\/chunks$/, (r) => answer(r, CHUNKS));
    await ctx.route(/\/kb\/kb1$/, (r) => answer(r, KBS.knowledge_bases[0]));
  } else {
    await ctx.route(/\/kb\/list$/, (r) => answer(r, { total: 0, knowledge_bases: [] }));
  }
  await ctx.route(/\/qa$/, async (r) => {
    const q = JSON.parse(r.request().postData() || '{}').question || '';
    await answer(r, /1998|unrelated/i.test(q) ? QA_OUT : QA_OK);
  });
  if (runs) {
    await ctx.route(/\/runs\/(r_[a-z]+_0001)\/events\.json/, (r) => {
      const id = /runs\/(r_[a-z]+_0001)/.exec(r.request().url())[1];
      answer(r, { events: synthetic(RUN_IDS[id]) });
    });
  }
}

const settle = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 6000 }).catch(() => {});
const hide = (page) => page.addStyleTag({ content: 'nextjs-portal,.tsqd-parent-container{display:none!important}' }).catch(() => {});

// Each state: a route, the mocks it needs, what to do once the page has loaded, and an optional scroll target.
const STATES = [
  { name: 'desk', route: home, mocks: { libraries: true }, run: async (p) => { await p.waitForTimeout(400); } },
  { name: 'desk-filled', route: home, mocks: { libraries: true }, run: async (p) => { await p.getByRole('button', { name: /Regular exercise cuts/ }).click(); } },
  { name: 'desk-story', route: home, mocks: { libraries: true }, run: async (p) => { await p.evaluate(() => document.getElementById('how-it-works')?.scrollIntoView()); await p.waitForTimeout(900); } },
  { name: 'desk-waking', route: home, mocks: { wake: true }, run: async (p) => { await p.getByRole('textbox').fill('The Berlin Wall fell in 1989.'); await p.getByRole('button', { name: 'Check this claim' }).click(); await p.waitForTimeout(3600); } },
  { name: 'ask-empty', route: '/ask', mocks: { libraries: false }, run: async (p) => { await p.waitForTimeout(600); } },
  { name: 'ask', route: '/ask', mocks: {}, active: 'kb1', run: async (p) => { await p.locator('[data-library-size]').waitFor(); await p.getByRole('textbox').fill('How much exercise does WHO recommend per week?'); await p.keyboard.press('Enter'); await p.locator('[data-exchange]').waitFor(); await p.locator('[data-cite]').first().click(); await p.waitForTimeout(500); } },
  { name: 'ask-outside', route: '/ask', mocks: {}, active: 'kb1', run: async (p) => { await p.locator('[data-library-size]').waitFor(); await p.getByRole('textbox').fill('Who won the 1998 football World Cup?'); await p.keyboard.press('Enter'); await p.locator('[data-out-of-library]').waitFor(); } },
  { name: 'library', route: '/library', mocks: {}, active: 'kb1', run: async (p) => { await p.locator('[data-kb]').first().waitFor(); } },
  { name: 'library-empty', route: '/library', mocks: { libraries: false }, run: async (p) => { await p.locator('[data-empty-libraries]').waitFor(); } },
  { name: 'library-delete', route: '/library', mocks: {}, run: async (p) => { await p.getByRole('button', { name: /Delete Old notes/ }).click(); await p.getByRole('dialog').waitFor(); } },
  { name: 'library-detail', route: '/library/kb1', mocks: {}, run: async (p) => { await p.locator('[data-chunk]').first().waitFor(); } },
  { name: 'runs-empty', route: '/runs', mocks: {}, run: async (p) => { await p.locator('[data-empty-runs]').waitFor(); } },
  { name: 'runs-list', route: '/runs', mocks: { runs: true }, history: true, run: async (p) => { await p.locator('[data-run]').first().waitFor(); await p.waitForTimeout(500); } },
  { name: 'runs-map', route: '/runs', mocks: { runs: true }, history: true, run: async (p) => { await p.getByRole('tab', { name: 'Map' }).click(); await p.locator('[data-integrity-map]').waitFor(); await p.locator('[data-dot]').first().hover(); } },
  { name: 'method', route: '/method', mocks: {}, run: async (p) => { await p.waitForTimeout(400); } },
  { name: 'method-scores', route: '/method', mocks: {}, run: async (p) => { await p.evaluate(() => document.getElementById('scores')?.scrollIntoView()); await p.waitForTimeout(900); } },
  { name: 'method-bench', route: '/method', mocks: {}, run: async (p) => { await p.getByLabel('Quiet falsehood').check(); await p.evaluate(() => document.getElementById('bench')?.scrollIntoView()); await p.waitForTimeout(900); } },
  { name: 'method-benchmark', route: '/method', mocks: {}, run: async (p) => { await p.evaluate(() => document.getElementById('benchmark')?.scrollIntoView()); await p.waitForTimeout(900); } },
  { name: 'developers-rest', route: '/developers', mocks: {}, run: async (p) => { await p.waitForTimeout(400); } },
  { name: 'developers-events', route: '/developers', mocks: {}, run: async (p) => { await p.getByRole('tab', { name: 'Events' }).click(); await p.waitForTimeout(400); } },
  { name: 'developers-mcp', route: '/developers', mocks: {}, run: async (p) => { await p.getByRole('tab', { name: 'MCP' }).click(); await p.waitForTimeout(400); } },
  { name: 'case-report', route: '/case/sample-exercise-mixed', mocks: {}, run: async (p) => { await p.locator('[data-run-status="completed"]').waitFor(); await p.waitForTimeout(500); } },
  { name: 'case-blocked', route: '/case/fixture-blocked?speed=20', mocks: {}, run: async (p) => { await p.locator('[data-run-status="completed"]').waitFor({ timeout: 90000 }); } },
  { name: 'command-menu', route: home, mocks: {}, run: async (p) => { await p.keyboard.press('Control+k'); await p.getByRole('dialog').waitFor(); } },
  { name: 'menu', route: home, mocks: {}, mobileOnly: true, run: async (p) => { await p.getByRole('button', { name: 'Open menu' }).click(); await p.getByRole('dialog').waitFor(); } },
];

const browser = await chromium.launch();
for (const set of SETS) {
  for (const st of STATES) {
    if (only.length && !only.some((o) => st.name.startsWith(o))) continue;
    if (st.mobileOnly && !set.mobile) continue;
    const ctx = await browser.newContext({
      viewport: set.viewport, deviceScaleFactor: set.dpr, isMobile: set.mobile, hasTouch: set.mobile, colorScheme: set.scheme,
      reducedMotion: set.reduced ? 'reduce' : 'no-preference',
    });
    await mock(ctx, st.mocks);
    await ctx.addInitScript(([hist, active, ids]) => {
      try {
        if (hist) localStorage.setItem('achp.runs.v1', JSON.stringify(ids.map((id, i) => ({ id, at: Date.now() - i * 3600e3 }))));
        if (active) localStorage.setItem('achp.activeKb.v1', active);
      } catch {}
    }, [!!st.history, st.active ?? null, Object.keys(RUN_IDS)]);
    const page = await ctx.newPage();
    try {
      await page.goto(base + st.route, { waitUntil: 'load' });
      await hide(page);
      await st.run(page);
      await settle(page);
      await page.screenshot({ path: path.join(outDir, `${st.name}-${set.name}.png`) });
    } catch (e) {
      console.error(`FAILED ${st.name} ${set.name}: ${String(e).split('\n')[0]}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log('done', outDir);

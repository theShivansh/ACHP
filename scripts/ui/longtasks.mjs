#!/usr/bin/env node
// P8 performance check (prompt: "long tasks > 50ms during the live run ≤ 2 on mobile-light with 4× CPU throttling").
// Opens a fixture replay on a 390px phone viewport in Chromium, throttles the CPU through the DevTools protocol,
// counts PerformanceObserver long tasks from the first event to run.completed, and prints them.
//
//   node scripts/ui/longtasks.mjs [--route "/case/fixture-exercise-mixed?speed=1"] [--rate 4] [--runs 3]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const route = flag('route', '/case/fixture-exercise-mixed?speed=1');
const rate = Number(flag('rate', '4'));
const runs = Number(flag('runs', '3'));
const reduced = argv.includes('--reduced');
// --lowfx: report 2 cores, so html[data-lowfx] turns the line boil off (to see what the boil costs).
const lowfx = argv.includes('--lowfx');

const browser = await chromium.launch();
const results = [];
for (let r = 0; r < runs; r += 1) {
  const ctx = await browser.newContext({ ...devices['iPhone 15'], viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.route('**/health', (x) => x.fulfill({ json: { status: 'ok', pipeline_mode: 'online', kb_count: 0 } }));
  // Warm the route once so the dev server's compile is not counted as the page's work.
  if (r === 0) { await page.goto(base + route); await page.locator('[data-run-status="completed"]').waitFor({ timeout: 180_000 }); }
  if (lowfx) await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
  await page.addInitScript(() => {
    const w = window;
    w.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(base + route);
  await page.locator('[data-run-status="running"]').waitFor({ timeout: 60_000 });
  const start = await page.evaluate(() => performance.now());
  await page.locator('[data-run-status="completed"]').waitFor({ timeout: 300_000 });
  await page.waitForTimeout(2000);
  const all = await page.evaluate(() => window.__long);
  const live = all.filter((x) => x.t >= start);
  results.push({ run: r + 1, liveLongTasks: live.length, live, beforeFirstEvent: all.length - live.length });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ route, rate, reduced, lowfx, results }, null, 1));

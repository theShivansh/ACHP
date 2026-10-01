#!/usr/bin/env node
// P8 captures of the stop-motion states a full-page shot at fixed times misses: the Framing Lens's tally mid-run (desk
// column, and the phone's lanes sheet), the cold-start lamp while /health hasn't answered, the lanes with their glyphs,
// and the arrival of the verdict caught mid-press (stamp, Hallmark punch, keys).
//
//   node scripts/ui/shoot-stop.mjs [--phase P8] [--base http://localhost:3000]
//
// Output: docs/upgrade/screens/<phase>/stop-<name>-<viewport>-<theme>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const phase = flag('phase', 'P8');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const outDir = path.resolve(process.cwd(), 'docs/upgrade/screens', phase);
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const ok = (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
const hideDevtools = (page) => page.addStyleTag({ content: 'nextjs-portal,.tsqd-parent-container{display:none!important}' }).catch(() => {});

const browser = await chromium.launch();
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.deviceScaleFactor, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, colorScheme: scheme });
    const page = await ctx.newPage();
    const shot = (name, opts = {}) => page.screenshot({ path: path.join(outDir, `stop-${name}-${vp}-${scheme}.png`), ...opts });

    // Waking: /health never answers while we look.
    await page.route('**/health', () => {});
    await page.goto(`${base}/case/fixture-synthetic-quiet-falsehood?speed=1`, { waitUntil: 'domcontentloaded' });
    await hideDevtools(page);
    await page.locator('[data-slot="status-chip"][data-status="waking"]').waitFor();
    await page.waitForTimeout(300);
    await shot('lamp-waking', { clip: { x: 0, y: 0, width: viewport.width, height: 120 } });
    await page.unroute('**/health');
    await page.route('**/health', ok);

    // The tally: once the Framing Lens has finished its checks and before the run folds the lanes.
    await page.goto(`${base}/case/fixture-exercise-mixed?speed=1`);
    await hideDevtools(page);
    await page.locator('[data-tally="5"]').first().waitFor({ state: 'attached', timeout: 90_000 });
    if (vp === 'mobile') {
      await page.getByRole('button', { name: /Show every agent|agents/ }).first().click().catch(() => {});
      await page.locator('[role="dialog"] [data-tally]').waitFor({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(400);
    await shot('tally');

    // The verdict arriving: a frame inside the press and the punch, then the settled header.
    await page.goto(`${base}/case/fixture-synthetic-quiet-falsehood?speed=1`);
    await hideDevtools(page);
    await page.locator('[data-run-status="completed"]').waitFor({ timeout: 90_000 });
    await page.waitForTimeout(420);
    await page.locator('article header').screenshot({ path: path.join(outDir, `stop-arrival-mid-${vp}-${scheme}.png`), animations: 'allow' });
    await page.waitForTimeout(1500);
    await page.locator('article header').screenshot({ path: path.join(outDir, `stop-arrival-settled-${vp}-${scheme}.png`) });
    await ctx.close();
  }
}
await browser.close();
console.log('done', outDir);

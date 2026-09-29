#!/usr/bin/env node
// P4 report captures a fixed time or a full-page shot can't show: the share bar in view, the open
// method drawer, and the Report tab scrolled to the strips. Complements shoot.mjs.
//
//   node scripts/ui/shoot-case-report.mjs [--phase P4] [--fixture exercise-mixed] [--base http://localhost:3000]
//
// Output: docs/upgrade/screens/<phase>/report-<name>-<viewport>-<theme>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const phase = flag('phase', 'P4');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const fixture = flag('fixture', 'exercise-mixed');
const outDir = path.resolve(process.cwd(), 'docs/upgrade/screens', phase);
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const settle = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => {});

const browser = await chromium.launch();
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.deviceScaleFactor, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.route('**/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
    await page.goto(`${base}/case/fixture-${fixture}?speed=20`);
    await page.locator('[data-run-status="completed"]').waitFor({ timeout: 90000 });
    await settle(page);
    const shot = (name) => page.screenshot({ path: path.join(outDir, `report-${name}-${vp}-${scheme}.png`) });

    await page.locator('[data-not-holding]').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    await settle(page);
    await shot('reading');

    await page.locator('li[data-claim]').first().scrollIntoViewIfNeeded();
    await settle(page);
    await shot('strips');

    await page.locator('[data-share-bar]').scrollIntoViewIfNeeded();
    await settle(page);
    await shot('share-bar');

    await page.getByRole('button', { name: /How we decided/ }).first().click();
    await page.getByRole('dialog').waitFor();
    await settle(page);
    await shot('method-drawer');
    await ctx.close();
  }
}
await browser.close();
console.log('done');

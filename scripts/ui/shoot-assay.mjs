#!/usr/bin/env node
// P5 Assay captures a full-page shot can't show: the Bench (moved), the lineage drawer (both formulas) and
// the agreement drawer, on the quiet-falsehood test log. Complements shoot.mjs.
//
//   node scripts/ui/shoot-assay.mjs [--phase P5] [--fixture synthetic-quiet-falsehood] [--base http://localhost:3000]
//
// Output: docs/upgrade/screens/<phase>/assay-<name>-<viewport>-<theme>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const phase = flag('phase', 'P5');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const fixture = flag('fixture', 'synthetic-quiet-falsehood');
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
    await page.goto(`${base}/case/fixture-${fixture}?speed=50&tab=assay`);
    await page.locator('[data-run-status="completed"]').waitFor({ timeout: 90000 });
    await settle(page);
    const shot = (name) => page.screenshot({ path: path.join(outDir, `assay-${name}-${vp}-${scheme}.png`) });

    await page.locator('[data-tipping]').scrollIntoViewIfNeeded();
    await settle(page);
    await shot('tipping');

    await page.getByRole('button', { name: 'Where the numbers come from' }).click();
    await page.getByRole('dialog').waitFor();
    await settle(page);
    await shot('lineage-production');
    await page.getByRole('button', { name: 'Paper formulas' }).click();
    await settle(page);
    await shot('lineage-paper');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'How much humans agreed' }).click();
    await page.getByRole('dialog').waitFor();
    await settle(page);
    await shot('agreement');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Try the formula' }).click();
    const bench = page.getByRole('dialog', { name: 'Assay Bench' });
    await bench.waitFor();
    await settle(page);
    await shot('bench-real');
    await bench.locator('#bench-fA').fill('0.95');
    await bench.locator('#bench-jCTS').fill('0.95');
    await bench.locator('#bench-s_fr').fill('0.6');
    await page.waitForTimeout(300);
    await settle(page);
    await shot('bench-moved');
    await ctx.close();
  }
}
await browser.close();
console.log('done');

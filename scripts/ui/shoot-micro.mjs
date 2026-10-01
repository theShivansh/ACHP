#!/usr/bin/env node
// P7 captures of the micro-interaction states a full-page shot can't show: a rejected claim, the sent line, the tab
// rule on Evidence, "Copied", a source hovered (rule + dimming), a Hallmark mark hovered (tooltip + ledger rule), and the
// Bench with the Two-Key's second key turned. Each is taken after the motion has settled.
//
//   node scripts/ui/shoot-micro.mjs [--phase P7] [--base http://localhost:3000]
//
// Output: docs/upgrade/screens/<phase>/micro-<name>-<viewport>-<theme>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const phase = flag('phase', 'P7');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const outDir = path.resolve(process.cwd(), 'docs/upgrade/screens', phase);
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const settle = (page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => {});
const hideDevtools = (page) => page.addStyleTag({ content: 'nextjs-portal,.tsqd-parent-container{display:none!important}' });

const browser = await chromium.launch();
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      colorScheme: scheme,
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    await page.route('**/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
    const shot = async (name) => {
      await settle(page);
      await page.screenshot({ path: path.join(outDir, `micro-${name}-${vp}-${scheme}.png`) });
    };

    // The Desk's claim input: rejected, then sent.
    await page.goto(`${base}/dev/desk`);
    await hideDevtools(page);
    await page.getByRole('textbox').fill('too short');
    await page.getByRole('button', { name: 'Check this claim' }).click();
    await page.locator('p[role="alert"]').waitFor();
    await shot('claim-rejected');

    // A finished case: the tab rule, "Copied", and a source hovered.
    await page.goto(`${base}/case/fixture-exercise-mixed?speed=20`);
    await hideDevtools(page);
    await page.locator('[data-run-status="completed"]').waitFor({ timeout: 90000 });
    await settle(page);
    if (vp === 'desktop') {
      await page.locator('aside li[data-evidence]').first().hover();
      await page.waitForTimeout(400);
      await shot('source-hovered');
      await page.mouse.move(2, 2);
    }
    await page.locator('[data-share-bar] button[data-confirm]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-share-bar] button[data-confirm]').first().click();
    await page.waitForTimeout(300);
    await shot('copied');
    await page.getByRole('tab', { name: /^Evidence/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole('tablist').scrollIntoViewIfNeeded();
    await shot('tab-evidence');

    // The Assay: a Hallmark mark hovered (tooltip, ledger rule), then the Bench.
    await page.goto(`${base}/case/fixture-synthetic-quiet-falsehood?speed=50&tab=assay`);
    await hideDevtools(page);
    await page.locator('[data-run-status="completed"]').waitFor({ timeout: 90000 });
    await settle(page);
    await page.getByRole('button', { name: 'Try the formula' }).click();
    const bench = page.getByRole('dialog', { name: 'Assay Bench' });
    for (const [id, v] of [['fA', '0.02'], ['jCTS', '0.02'], ['s_nil', '1'], ['s_fr', '1']]) await bench.locator(`#bench-${id}`).fill(v);
    await page.waitForTimeout(400);
    await bench.locator('[data-bench-result]').scrollIntoViewIfNeeded();
    await shot('bench-key-turned');
    // In the Bench the marks stay on screen (sticky) while the ledger scrolls beneath them: the link is visible.
    if (vp === 'desktop') {
      await bench.locator('[data-ledger]').scrollIntoViewIfNeeded();
      await bench.locator('[data-bench-result] [data-metric="BIS"]').first().focus();
      await page.waitForTimeout(400);
      await shot('bench-hallmark-ledger');
    }
    await ctx.close();
  }
}
await browser.close();
console.log('done', outDir);

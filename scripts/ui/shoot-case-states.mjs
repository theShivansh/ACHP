#!/usr/bin/env node
// Case-page state captures that a fixed time can't hit reliably (P3 review): each capture waits for
// the state itself to be on the page, then shoots. Complements shoot.mjs (times + done).
//
//   node scripts/ui/shoot-case-states.mjs [--phase P3] [--base http://localhost:3000] [--fixture synthetic-mixed]
//
// Output: docs/upgrade/screens/<phase>/case-state-<name>-<viewport>-<theme>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const phase = flag('phase', 'P3');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const fixture = flag('fixture', 'synthetic-mixed');
const outDir = path.resolve(process.cwd(), 'docs/upgrade/screens', phase);
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const settle = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => {});

const STATES = [
  {
    name: 'parallel-working',
    url: `/case/fixture-${fixture}?speed=0.5`,
    wait: (p) => p.locator('li[data-agent="adversary_b"][data-state="working"]').first().waitFor({ state: 'attached', timeout: 60000 }),
  },
  {
    name: 'interrupted',
    url: `/case/fixture-${fixture}?speed=1&drop=20`,
    wait: (p) => p.getByRole('alert').filter({ hasText: 'Lost connection' }).waitFor({ timeout: 60000 }),
  },
  {
    name: 'lanes-sheet',
    only: 'mobile',
    url: `/case/fixture-${fixture}?speed=4`,
    wait: async (p) => {
      await p.locator('[data-run-status="completed"]').waitFor({ timeout: 60000 });
      await p.getByRole('complementary', { name: 'Agents' }).getByRole('button').click();
      await p.getByRole('dialog', { name: 'The desk' }).waitFor();
    },
  },
  {
    name: 'evidence-sheet',
    url: `/case/fixture-${fixture}?speed=4`,
    wait: async (p, vp) => {
      await p.locator('[data-run-status="completed"]').waitFor({ timeout: 60000 });
      if (vp === 'desktop') return; // the tray is always open at ≥1280
      await p.getByRole('button', { name: /sources?: open the evidence/ }).click();
      await p.getByRole('dialog', { name: 'Evidence' }).waitFor();
    },
  },
];

const browser = await chromium.launch();
const shots = [];
for (const s of STATES) {
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    if (s.only && s.only !== vp) continue;
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: size.hasTouch, colorScheme: theme });
      const page = await ctx.newPage();
      await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
      await page.goto(new URL(s.url, base).toString(), { waitUntil: 'domcontentloaded' });
      try {
        await s.wait(page, vp);
        // Live states have a boiling glyph by design; only settled states wait for stillness.
        if (s.name.endsWith('sheet')) await settle(page);
        const f = path.join(outDir, `case-state-${s.name}-${vp}-${theme}.png`);
        await page.screenshot({ path: f });
        shots.push(path.relative(process.cwd(), f));
      } catch (e) {
        console.error(`✗ ${s.name} ${vp} ${theme}: ${e.message.split('\n')[0]}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(shots.join('\n'));

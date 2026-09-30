#!/usr/bin/env node
// ACHP screenshot + stillness harness (Playwright).
//
// Examples
//   node scripts/ui/shoot.mjs --phase P3 --routes "/case/fixture-exercise-mixed?speed=4" --at 2000,6000,done
//   node scripts/ui/shoot.mjs --phase P6 --routes "/case/fixture-exercise-mixed?replay=1" --scroll 0,0.3,0.45,0.6,1
//   node scripts/ui/shoot.mjs --phase P0-target --url "file://$PWD/docs/upgrade/achp-site.html#/,file://$PWD/docs/upgrade/achp-site.html#/case" --at 1500,6000,done
//   node scripts/ui/shoot.mjs --phase P8 --routes "/case/fixture-exercise-mixed" --video
//
// Output: docs/upgrade/screens/<phase>/<slug>-<viewport>-<theme>[-reduced][-t<ms>|-s<pct>|-done].png
//         docs/upgrade/screens/<phase>/stillness.json  (running animations 2s after "done", per capture set)
//
// Flags
//   --phase <id>          folder name (default "adhoc")
//   --routes a,b          paths relative to --base (default "/")
//   --url <abs,abs>       absolute URL(s) instead of --routes (file:// and #hash routes work)
//   --base <url>          default $BASE_URL or http://localhost:3000
//   --at t1,t2,done       ms after load; "done" waits for [data-run-status="completed"] (max 180s)
//   --scroll f1,f2        page-height fractions to capture (0..1) after load/done
//   --viewports m,d       mobile (390x844) and/or desktop (1440x900); default both
//   --themes l,d          light and/or dark via prefers-color-scheme; default both
//   --no-reduced          skip the extra mobile reduced-motion capture
//   --full                full-page screenshots
//   --no-mock-health      don't answer /health for /case/fixture-* routes (default: answered, so the chip reads Ready)
//   --video               also record a desktop-light video (webm) of the whole session
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Playwright not found. Run: pnpm add -D playwright (and `npx playwright install chromium` if browsers are missing).'); process.exit(1); }

const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const list = (v) => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);

const phase = flag('phase', 'adhoc');
const mockHealth = !argv.includes('--no-mock-health');
const base = flag('base', process.env.BASE_URL || 'http://localhost:3000');
const url = flag('url', null);
const routes = url ? list(url) : list(flag('routes', '/'));
const at = list(flag('at', '')) ;
const scroll = list(flag('scroll', '')).map(Number);
const vpSel = list(flag('viewports', 'm,d'));
const themeSel = list(flag('themes', 'l,d'));
const reducedExtra = !argv.includes('--no-reduced');
const fullPage = argv.includes('--full');
const video = argv.includes('--video');

const VIEWPORTS = { m: { name: 'mobile', width: 390, height: 844, dpr: 2, mobile: true }, d: { name: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false } };
const THEMES = { l: 'light', d: 'dark' };
const outDir = path.resolve(process.cwd(), 'docs/upgrade/screens', String(phase));
fs.mkdirSync(outDir, { recursive: true });

const slugify = (r) => r.replace(/^file:\/\/.*\/(?=[^/]*\.html)/, '').replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runningAnimations(page) {
  return page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').map(a => {
    const t = a.effect && a.effect.target; return { name: a.animationName || a.id || a.constructor.name, target: t ? (t.id ? '#' + t.id : t.tagName?.toLowerCase() + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ').slice(0, 2).join('.') : '')) : '?' };
  }));
}

async function captureSet(browser, route, vp, theme, reduced, stillness) {
  const full = route.startsWith('http') || route.startsWith('file:') ? route : new URL(route, base).toString();
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile,
    colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference',
    ...(video && vp.name === 'desktop' && theme === 'light' && !reduced ? { recordVideo: { dir: outDir, size: { width: vp.width, height: vp.height } } } : {}),
  });
  const page = await ctx.newPage();
  // Fixture replays never reach the backend: answer /health so the chip reads "Ready", not a red "Unreachable"
  // (it is not an error on a replay), and hide the framework's dev overlay, which would sit over the sheet.
  if (mockHealth && /\/case\/fixture-/.test(route)) {
    await page.route('**/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
  }
  await page.addInitScript(() => {
    // The framework's dev overlay and the query devtools button are not the page.
    const css = 'nextjs-portal,.tsqd-parent-container{display:none!important}';
    const add = () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); };
    document.head ? add() : document.addEventListener('DOMContentLoaded', add);
  });
  const tag = `${slugify(route)}-${vp.name}-${theme}${reduced ? '-reduced' : ''}`;
  const t0 = Date.now();
  await page.goto(full, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const shots = [];
  const snap = async (suffix) => { const f = path.join(outDir, `${tag}${suffix}.png`); await page.screenshot({ path: f, fullPage }); shots.push(path.relative(process.cwd(), f)); };

  if (!at.length && !scroll.length) await snap('');
  for (const t of at) {
    if (t === 'done') {
      const ok = await page.waitForSelector('[data-run-status="completed"], [data-run-status="failed"]', { timeout: 180000 }).then(() => true).catch(() => false);
      await sleep(400);
      await snap(ok ? '-done' : '-done-TIMEOUT');
      await sleep(2000);
      stillness.push({ capture: tag, route, running: await runningAnimations(page) });
    } else {
      const wait = Number(t) - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      await snap(`-t${t}`);
    }
  }
  for (const f of scroll) {
    await page.evaluate((frac) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * frac), f);
    await sleep(700); // scroll-linked reveals settle on the next frames
    await snap(`-s${Math.round(f * 100)}`);
  }
  await ctx.close();
  return shots;
}

const browser = await chromium.launch();
const stillness = [];
const all = [];
try {
  for (const route of routes) {
    for (const v of vpSel) for (const th of themeSel) {
      const vp = VIEWPORTS[v[0]]; const theme = THEMES[th[0]];
      if (!vp || !theme) continue;
      all.push(...await captureSet(browser, route, vp, theme, false, stillness));
    }
    if (reducedExtra) all.push(...await captureSet(browser, route, VIEWPORTS.m, 'light', true, stillness));
  }
} finally {
  await browser.close();
}
if (stillness.length) fs.writeFileSync(path.join(outDir, 'stillness.json'), JSON.stringify(stillness, null, 2));
console.log(`Saved ${all.length} screenshot(s) to ${path.relative(process.cwd(), outDir)}`);
for (const s of all) console.log('  ' + s);
const moving = stillness.filter(s => s.running.length);
if (moving.length) { console.log(`Stillness: ${moving.length} capture(s) still animating 2s after done → see stillness.json`); process.exitCode = 3; }
else if (stillness.length) console.log('Stillness: pass (0 running animations 2s after done)');

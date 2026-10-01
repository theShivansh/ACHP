import { expect, test, type Page } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';

// P8: the stop-motion layer (05 §3, §6). Handmade moments run at 12fps in steps(), only when their event arrives
// while you watch, within the boil budget, and the page is completely still at rest.

test.describe.configure({ timeout: 120_000 });

const done = '[data-run-status="completed"]';
const { name } = pickFixture('exercise-mixed', 'synthetic-mixed');
const mixed = `/case/fixture-${name}?speed=4`;
const quiet = '/case/fixture-synthetic-quiet-falsehood?speed=20';
const STOP_MOTION = ['mark-draw', 'boil', 'swipe', 'stamp', 'punch-in', 'ink-rise', 'key-upright', 'clip-snap', 'tally-in', 'cut-line', 'cut-up', 'cut-down', 'lamp'];

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name.includes('reduced'), 'reduced motion has its own spec (reduced.spec.ts)');
});

/** Every CSS animation that starts, with the timing function and iteration count it runs with. */
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __anim: { name: string; timing: string; iterations: string }[] };
    w.__anim = [];
    document.addEventListener(
      'animationstart',
      (e) => {
        const cs = getComputedStyle(e.target as Element);
        const names = cs.animationName.split(', ');
        const i = Math.max(0, names.indexOf((e as AnimationEvent).animationName));
        w.__anim.push({
          name: (e as AnimationEvent).animationName,
          timing: cs.animationTimingFunction.split(/,\s*(?![^(]*\))/)[i] ?? '',
          iterations: cs.animationIterationCount.split(', ')[i] ?? '',
        });
      },
      true,
    );
  });
}
const started = (page: Page) =>
  page.evaluate(() => (window as unknown as { __anim: { name: string; timing: string; iterations: string }[] }).__anim);

/** Visible boiling glyphs (a hidden layout's copies don't run). */
const boiling = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.boil')].filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0 && getComputedStyle(e).animationName === 'boil').length);

const atRest = (page: Page) =>
  page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === 'running').length,
    boilClass: document.querySelectorAll('.boil').length,
    filtered: [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).filter.includes('boil')).length,
  }));

test('a live run: every handmade moment is stepped, the boil stays within 3, and 2s after the end nothing moves', async ({ page }) => {
  await healthOk(page);
  await recordAnimations(page);
  await page.goto(mixed);
  let maxBoil = 0;
  while (!(await page.locator(done).isVisible())) {
    maxBoil = Math.max(maxBoil, await boiling(page));
    await page.waitForTimeout(80);
  }
  expect(maxBoil).toBeGreaterThan(0);
  expect(maxBoil).toBeLessThanOrEqual(3);

  const anims = await started(page);
  const names = new Set(anims.map((a) => a.name));
  for (const n of ['mark-draw', 'boil', 'stamp', 'clip-snap', 'tally-in', 'swipe', 'cut-line']) expect(names, n).toContain(n);
  // 12fps: never a smooth curve on a handmade element (05 §3).
  const smooth = anims.filter((a) => STOP_MOTION.includes(a.name) && !/^steps\(/.test(a.timing));
  expect(smooth).toEqual([]);
  // The only loops: a working glyph's boil and the lamp while waking. A fresh mark boils 3 times.
  expect(anims.filter((a) => a.iterations === 'infinite').map((a) => a.name).filter((n) => n !== 'boil' && n !== 'lamp')).toEqual([]);
  expect(anims.filter((a) => a.name === 'boil' && a.iterations !== 'infinite').every((a) => a.iterations === '3')).toBe(true);

  await page.waitForTimeout(2000);
  expect(await atRest(page)).toEqual({ running: 0, boilClass: 0, filtered: 0 });
  // Marks stay drawn, stamps stay pressed.
  await expect(page.locator('.mark path').first()).toHaveCSS('stroke-dashoffset', '0px');
  await expect(page.locator('[data-slot="stamp"]').first()).toHaveCSS('opacity', '1');
});

test('the Assay arrives: the stamp presses, the Hallmark punches in one cartouche a frame, then the keys turn', async ({ page }) => {
  await healthOk(page);
  await recordAnimations(page);
  await page.goto(quiet);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-hallmark][data-punch]')).toBeVisible();
  await expect(page.locator('[data-two-key][data-arrive]')).toBeVisible();
  await page.waitForTimeout(1500); // the punch and the keys wait for the stamp, then go one frame at a time
  const anims = await started(page);
  const count = (n: string) => anims.filter((a) => a.name === n).length;
  expect(count('punch-in')).toBe(5);
  expect(count('ink-rise')).toBe(5);
  expect(count('key-upright')).toBe(2);
  // Each cartouche waits one more frame than the one before it.
  const delays = await page.locator('[data-punch] [data-cartouche]').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).animationDelay)));
  for (let i = 1; i < delays.length; i += 1) expect(delays[i]).toBeGreaterThan(delays[i - 1]);
  await page.waitForTimeout(2000);
  expect((await atRest(page)).running).toBe(0);
});

test('seen again is not new: switching tabs back to the report does not redraw a mark or re-press a stamp', async ({ page }) => {
  await healthOk(page);
  await page.goto(mixed);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as { __anim: unknown[] }).__anim = [];
    document.addEventListener('animationstart', (e) => (window as unknown as { __anim: { name: string }[] }).__anim.push({ name: (e as AnimationEvent).animationName }), true);
  });
  await page.getByRole('tab', { name: /^Evidence/ }).click();
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.locator('[data-claim] .mark').first()).toBeAttached();
  await page.waitForTimeout(400);
  const names = (await started(page)).map((a) => a.name);
  expect(names.filter((n) => STOP_MOTION.includes(n)), JSON.stringify(names)).toEqual([]);
});

test('low-end devices (4 cores or fewer) get no boil at all', async ({ page }) => {
  await healthOk(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
  await recordAnimations(page);
  await page.goto(mixed);
  await expect(page.locator('html')).toHaveAttribute('data-lowfx', '');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const anims = await started(page);
  expect(anims.filter((a) => a.name === 'boil')).toEqual([]);
  // The marks still draw; only the wobble is gone.
  expect(anims.some((a) => a.name === 'mark-draw')).toBe(true);
});

test('the cold-start lamp flickers only while the backend wakes, and stops when it answers', async ({ page }) => {
  let answer: () => void = () => {};
  const answered = new Promise<void>((r) => (answer = r));
  await page.route('**/health', async (route) => {
    await answered;
    await route.fulfill({ json: { status: 'ok', pipeline_mode: 'online', kb_count: 0 } });
  });
  await page.goto('/case/fixture-synthetic-quiet-falsehood?speed=50');
  const chip = page.locator('[data-slot="status-chip"]');
  await expect(chip).toHaveAttribute('data-status', 'waking');
  await expect(chip.locator('.lamp')).toHaveCSS('animation-name', 'lamp');
  answer();
  await expect(chip).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
  await expect(chip.locator('.lamp')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';

// P8: under prefers-reduced-motion every handmade moment is in its final state at once (05 §3, §6): marks drawn,
// stamps in place, no boil, no punch, no cut, no snap, no swipe, a still lamp. The events still update the content;
// only the "how" changes. Runs in every project with reduced motion forced on.

test.use({ reducedMotion: 'reduce' });
test.describe.configure({ timeout: 120_000 });

const done = '[data-run-status="completed"]';
const { name } = pickFixture('exercise-mixed', 'synthetic-mixed');
const STOP_MOTION = ['mark-draw', 'boil', 'swipe', 'stamp', 'punch-in', 'ink-rise', 'key-upright', 'clip-snap', 'tally-in', 'cut-line', 'cut-up', 'cut-down', 'lamp'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __anim: string[] };
    w.__anim = [];
    document.addEventListener('animationstart', (e) => w.__anim.push((e as AnimationEvent).animationName), true);
  });
});
const started = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __anim: string[] }).__anim);

test('the case page: a live run shows every mark drawn and every stamp in place, with no stop-motion at all', async ({ page }) => {
  await healthOk(page);
  await page.goto(`/case/fixture-${name}?speed=4`);
  // Mid-run: a mark that has arrived is already fully drawn.
  await expect(page.locator('[data-claim] .mark path').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[data-claim] .mark path').first()).toHaveCSS('stroke-dashoffset', '0px');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-slot="stamp"]').first()).toBeVisible();
  await expect(page.locator('[data-slot="stamp"]').first()).toHaveCSS('animation-name', 'none');
  expect((await started(page)).filter((n) => STOP_MOTION.includes(n))).toEqual([]);
  // The handmade results are all there.
  await expect(page.locator('[data-highlight]').first()).toBeVisible();
  await expect(page.locator('[data-tally]').first()).toBeAttached();
  await expect(page.locator('[data-cutting]')).toHaveCount(0); // never drawn
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

test('the Assay: the Hallmark and the Two-Key are complete at once', async ({ page }) => {
  await healthOk(page);
  await page.goto('/case/fixture-synthetic-quiet-falsehood?speed=20');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-hallmark] [data-cartouche]')).toHaveCount(5);
  await expect(page.locator('[data-hallmark] [data-cartouche]').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-two-key] [data-key-glyph]').first()).toHaveCSS('animation-name', 'none');
  expect((await started(page)).filter((n) => STOP_MOTION.includes(n))).toEqual([]);
});

test('the replay: a normal document, no pin, no reveal, marks drawn, nothing running', async ({ page }) => {
  await healthOk(page);
  await page.goto(`/case/fixture-${name}?replay=1`);
  await expect(page.locator('[data-story]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.story .mark').first()).toBeAttached();
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(300);
  for (const stage of await page.locator('.story-friction > .stage').all()) await expect(stage).toHaveCSS('position', 'static');
  await expect(page.locator('.story .mark path').first()).toHaveCSS('stroke-dashoffset', '0px');
  expect((await started(page)).filter((n) => STOP_MOTION.includes(n) || n === 'reveal-up')).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

test('waking: the lamp is lit and still', async ({ page }) => {
  await page.route('**/health', () => {}); // never answers during the test
  await page.goto('/case/fixture-synthetic-quiet-falsehood?speed=50');
  const lamp = page.locator('[data-slot="status-chip"] .lamp');
  await expect(lamp).toBeVisible();
  await expect(lamp).toHaveCSS('animation-name', 'none');
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';

// P3 a11y gate (09 §4): axe in every run state, focus goes back where it came from when a sheet
// closes, and the page's live regions never speak more than once per 2 seconds.

test.describe.configure({ timeout: 90_000 });

const mixed = pickFixture('exercise-mixed', 'synthetic-mixed').name;
const failed = pickFixture('failed-midway', 'synthetic-failed-judge').name;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

const STATES: { name: string; url: string; ready: string }[] = [
  { name: 'completed', url: `/case/fixture-${mixed}?speed=4`, ready: '[data-run-status="completed"]' },
  { name: 'failed', url: `/case/fixture-${failed}?speed=4`, ready: '[data-run-status="failed"]' },
  { name: 'blocked', url: '/case/fixture-blocked', ready: '[data-blocked]' },
  { name: 'interrupted', url: `/case/fixture-${mixed}?speed=1&drop=20`, ready: '[data-interrupted]' },
];

for (const s of STATES) {
  test(`axe: no violations when ${s.name}`, async ({ page }) => {
    await page.goto(s.url);
    await expect(page.locator(s.ready)).toBeVisible({ timeout: 60_000 });
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('closing a sheet returns focus to the button that opened it', async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 0;
  test.skip(width >= 1280, 'the sheets are the <1280px layout');
  await page.goto(`/case/fixture-${mixed}?speed=4`);
  await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });

  // On a finished case the case bar's sources button goes to the Evidence tab (no sheet).
  const opener = page.getByRole('button', { name: /open the evidence/ });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: /Evidence/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Report' }).click();

  const part = page.locator('li[data-claim]').getByRole('button', { name: /source/ }).first();
  await part.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Evidence' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(part).toBeFocused();

  if (width < 768) {
    const strip = page.getByRole('complementary', { name: 'Agents' }).getByRole('button');
    await strip.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'The desk' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(strip).toBeFocused();
  }
});

test('live regions speak at most once per 2 seconds', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: { t: number; text: string }[] };
    w.__spoken = [];
    const live = (n: Node | null) =>
      n instanceof Element ? n.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]') : null;
    new MutationObserver((records) => {
      for (const r of records) {
        const region = live(r.target instanceof Element ? r.target : r.target.parentElement);
        // The backend chip in the header is not part of the case log.
        if (!region || region.closest('[data-slot="status-chip"]')) continue;
        const text = region.textContent?.trim() ?? '';
        const last = w.__spoken.at(-1);
        if (text && last?.text !== text) w.__spoken.push({ t: performance.now(), text });
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(`/case/fixture-${mixed}?speed=1`);
  await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500); // let the last queued sentence out
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: { t: number; text: string }[] }).__spoken);
  expect(spoken.length).toBeGreaterThan(2);
  // One paced voice: the announcer spaces sentences 2s apart on its own clock; the DOM shows each
  // one after a React commit, which can lag ~100–300ms under load. Unpaced speech lands within
  // milliseconds, so 1.7s still catches it.
  const close = spoken.filter((s, i) => i > 0 && s.t - spoken[i - 1].t < 1700);
  expect(close, JSON.stringify(spoken, null, 1)).toEqual([]);
});

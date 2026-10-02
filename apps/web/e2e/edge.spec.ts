import { expect, test, type Page } from '@playwright/test';
import { mockBackend } from './site-mocks';

// P10 edge cases (09 §6): messy inputs and partial failures render as calmly as a normal check. The logs come from the
// real pipeline with a fake model (scripts/synthetic_run_logs.py); each page says it is a synthetic test log.

test.describe.configure({ timeout: 90_000 });

const done = '[data-run-status="completed"]';
const open = async (page: Page, name: string, query = '?speed=50') => {
  await mockBackend(page, { libraries: [] });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/case/fixture-synthetic-edge-${name}${query}`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  return errors;
};
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('a 2,000-character message: the headline wraps, nothing scrolls sideways, and the parts still read', async ({ page }) => {
  const errors = await open(page, 'long-claim');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Regular exercise reduces heart disease risk');
  expect(await noSidewaysScroll(page)).toBe(true);
  await expect(page.locator('li[data-claim]')).toHaveCount(2);
  await expect(page.locator('[data-recorded-notice]')).toHaveText('A synthetic test log, not a real check.');
  expect(errors).toEqual([]);
});

test('one part, and the most parts the backend allows (eight), each with its own stamp', async ({ page }) => {
  await open(page, 'one-part');
  await expect(page.locator('li[data-claim]')).toHaveCount(1);
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'supported');
  await open(page, 'max-parts');
  await expect(page.locator('li[data-claim]')).toHaveCount(8);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('nothing settled and no sources: every part says so, nothing is called false', async ({ page }) => {
  await open(page, 'all-unverifiable');
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'unverifiable');
  // Nothing is called false or "does not hold": the only place the word appears is the reminder that unsettled is not false.
  const text = (await page.locator('main').innerText()).replaceAll('Not settled is not the same as false.', '');
  expect(text).not.toMatch(/does not hold|false/i);
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.locator('main')).toContainText(/no source|No sources/i);
});

test('a claim nobody could settle still gets an Assay readout: the five scores are on The Assay tab, not a no-readout notice', async ({ page }) => {
  await open(page, 'all-unverifiable');
  await page.getByRole('tab', { name: 'The Assay' }).click();
  await expect(page.locator('[data-assay="none"]')).toHaveCount(0);
  await expect(page.locator('[data-assay]:not([data-assay="none"])')).toBeVisible();
  for (const code of ['CTS', 'PCS', 'BIS', 'NSS', 'EPS']) await expect(page.locator(`tr[data-metric="${code}"]`).first()).toBeVisible();
  await expect(page.getByText(/no score readout/i)).toHaveCount(0);
});

test('a Not settled stamp still says what it can: not false, why, the Assay hint, and what would settle it', async ({ page }) => {
  await open(page, 'all-unverifiable');
  const block = page.locator('[data-not-settled]');
  await expect(block).toContainText('Not settled is not the same as false.');
  await expect(block).toContainText(/We found no source that decides it|none decides it|opinion or a preference/);
  await expect(block).toContainText(/say exactly what|say what you mean exactly/);
  // The Assay's closest reading is a hint with no number, and says it does not check facts.
  const hint = page.locator('[data-not-settled-scores]');
  await expect(hint).toContainText('do not check facts');
  expect(await hint.innerText()).not.toMatch(/\d/);
  // The stamp itself did not change: nothing was called true or false.
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'unverifiable');
  // A settled verdict does not get this block.
  await open(page, 'one-part');
  await expect(page.locator('[data-not-settled]')).toHaveCount(0);
});

test('a very long source title and quote wrap inside the card', async ({ page }) => {
  await open(page, 'long-source');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const title = page.locator('[data-evidence] h3').first();
  await expect(title).toContainText('Cardiovascular outcomes');
  const fits = await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('a right-to-left quote reads right to left inside the English page', async ({ page }) => {
  await open(page, 'rtl-quote');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const quote = page.locator('[data-evidence] blockquote p').first();
  await expect(quote).toHaveAttribute('dir', 'auto');
  expect(await quote.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  await expect(page.locator('[data-evidence] h3').first()).toHaveAttribute('dir', 'auto');
});

test('one challenger fails and the run continues: its lane says so, the verdict still stands on the others', async ({ page }) => {
  const errors = await open(page, 'adversary-failed');
  await expect(page.locator('[data-agent="adversary_b"]').first()).toHaveAttribute('data-state', 'failed');
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'mixed');
  expect(errors).toEqual([]);
});

test('at 200% zoom (a 720 × 450 window) the Desk and a case fit without scrolling sideways', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the desktop window at 200%');
  await page.setViewportSize({ width: 720, height: 450 });
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.goto('/case/fixture-exercise-mixed?speed=50');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('Windows high contrast: the pencil marks stay drawn, in the system text colour', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'a desktop setting');
  await page.emulateMedia({ forcedColors: 'active' });
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/fixture-exercise-mixed?speed=50');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const result = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'CanvasText';
    document.body.append(probe);
    const canvasText = getComputedStyle(probe).color;
    probe.remove();
    const paths = [...document.querySelectorAll<SVGPathElement>('.mark:not([data-relation="framing"]):not([data-relation="supports"]) path')];
    return { canvasText, n: paths.length, strokes: [...new Set(paths.map((p) => getComputedStyle(p).stroke))] };
  });
  expect(result.n).toBeGreaterThan(0);
  expect(result.strokes).toEqual([result.canvasText]);
  // axe has no model of forced colours (it reads author colours against the forced Canvas), so this test checks the
  // signals directly; axe runs in light and dark in a11y.spec.ts. The active tab keeps a visible rule of its own.
  const tabs = await page.locator('[data-slot="tabs-trigger"]').evaluateAll((els) =>
    els.map((e) => ({ active: e.getAttribute('data-state') === 'active', border: getComputedStyle(e).borderBottomColor })),
  );
  const activeBorder = tabs.find((t) => t.active)!.border;
  expect(tabs.filter((t) => !t.active).every((t) => t.border !== activeBorder)).toBe(true);
});

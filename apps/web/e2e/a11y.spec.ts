import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { KB_READY, mockBackend } from './site-mocks';

// P10 accessibility gate (09 §2, §4): axe (WCAG 2.2 A/AA) finds nothing serious or critical on the pages people use,
// in light and in dark (the desktop-light and desktop-dark projects), including a case caught mid-run.

test.describe.configure({ timeout: 120_000 });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

const still = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !(a.timeline instanceof DocumentTimeline)));

test('the Desk', async ({ page }) => {
  await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await still(page);
  expect(await axe(page)).toEqual([]);
});

test('a case while it runs (lanes working, the sheet filling in)', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/fixture-exercise-mixed?speed=1');
  // On a phone the lanes sit in a closed sheet, so wait for the state, not for visibility.
  await expect(page.locator('[data-agent][data-state="working"]').first()).toBeAttached({ timeout: 30_000 });
  expect(await axe(page)).toEqual([]);
});

test('a finished case, on each tab', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/fixture-exercise-mixed?speed=50');
  await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });
  await still(page);
  expect(await axe(page)).toEqual([]);
  for (const tab of ['Evidence', 'Assay', 'Trace']) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click();
    await expect(page.getByRole('tab', { name: new RegExp(tab) })).toHaveAttribute('aria-selected', 'true');
    await still(page);
    expect(await axe(page), tab).toEqual([]);
  }
});

test('how ACHP decides', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  await still(page);
  expect(await axe(page)).toEqual([]);
});

test('libraries', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/library');
  await expect(page.locator('[data-kb]').first()).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('the replay story, at the top and at the verdict', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/fixture-exercise-mixed?replay=1');
  await expect(page.locator('[data-story]')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.locator('#chapter-verdict').scrollIntoViewIfNeeded();
  await still(page);
  expect(await axe(page)).toEqual([]);
});

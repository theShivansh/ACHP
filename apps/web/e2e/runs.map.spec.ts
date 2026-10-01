import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mockBackend, seedStorage } from './site-mocks';

// Your checks (07 §5, 11 §3.9, S8.3): a list, and the Integrity Map with four named quadrants, 24px hit areas, a
// table twin and click-through. The run ids come from localStorage; each row is read from the run's stored log.

test.describe.configure({ timeout: 60_000 });

const LOGS = path.resolve(__dirname, '..', 'lib', 'runs', '__tests__', 'logs');
const events = (name: string) =>
  readFileSync(path.join(LOGS, `synthetic-${name}.jsonl`), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const RUNS: Record<string, string> = {
  r_quiet_0001: 'quiet-falsehood',
  r_loud_0001: 'loud-falsehood',
  r_loaded_0001: 'true-but-loaded',
  r_mixed_0001: 'mixed',
  r_blocked_0001: 'blocked',
};

async function withRuns(page: Page) {
  await mockBackend(page, { libraries: [] });
  await seedStorage(page, { 'achp.runs.v1': Object.keys(RUNS).map((id, i) => ({ id, at: Date.now() - i * 3600_000 })) });
  await page.route(/\/runs\/(r_[a-z]+_0001)\/events\.json/, (route) => {
    const id = /\/runs\/(r_[a-z]+_0001)/.exec(route.request().url())![1];
    return route.fulfill({ json: { events: events(RUNS[id]) }, headers: { 'access-control-allow-origin': '*' } });
  });
}

test('the list shows each check with its stamp, its Hallmark and its two keys; a blocked one has no scores', async ({ page }) => {
  await withRuns(page);
  await page.goto('/runs');
  await expect(page.locator('[data-run]')).toHaveCount(5);
  const quiet = page.locator('[data-run="r_quiet_0001"]');
  await expect(quiet.locator('[data-slot="stamp"]')).toHaveAttribute('aria-label', 'Verdict: Contradicted');
  await expect(quiet.locator('[data-hallmark]')).toBeVisible();
  await expect(quiet).toContainText('Split decision');
  const blocked = page.locator('[data-run="r_blocked_0001"]');
  await expect(blocked.locator('[data-slot="stamp"]')).toHaveAttribute('aria-label', /Not checked/);
  await expect(blocked.locator('[data-hallmark]')).toHaveCount(0);
  await expect(blocked).toContainText('Not scored');
  // A check can be taken off the list, and the case is untouched.
  await quiet.getByRole('button', { name: /Remove/ }).click();
  await expect(page.locator('[data-run]')).toHaveCount(4);
});

test('the map names its four quadrants, plots one dot per scored check and has a table twin', async ({ page }) => {
  await withRuns(page);
  await page.goto('/runs');
  await page.getByRole('tab', { name: 'Map' }).click();
  const map = page.locator('[data-integrity-map]');
  for (const q of ['Quiet falsehood', 'Sound', 'Loud falsehood', 'True but loaded']) await expect(map.locator('svg').getByText(q, { exact: true })).toBeVisible();
  await expect(map.locator('svg')).toContainText('Facts: the Consensus Truth Score (CTS)');
  // The blocked check has no scores, so four of the five are plotted.
  await expect(map.locator('[data-dot]')).toHaveCount(4);
  // The table twin lists the same four, with the same quadrants.
  await expect(map.locator('[data-map-table] tbody tr')).toHaveCount(4);
  await expect(map.locator('[data-row="r_quiet_0001"]')).toContainText('Quiet falsehood');
  await expect(map.locator('[data-row="r_loud_0001"]')).toContainText('Loud falsehood');
  await expect(map.locator('[data-row="r_loaded_0001"]')).toContainText('True but loaded');
});

test('dots are 9px with a 24px hit area; hovering one reads it out; a click opens its case', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'hover and the plot are the desktop path; the table carries a phone');
  await withRuns(page);
  await page.goto('/runs');
  await page.getByRole('tab', { name: 'Map' }).click();
  const dot = page.locator('[data-dot="r_quiet_0001"]');
  const hit = page.locator('a[href="/case/r_quiet_0001"] [data-hit]');
  const box = await dot.boundingBox();
  const hitBox = await hit.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(8);
  expect(hitBox!.width).toBeGreaterThanOrEqual(24);
  await dot.hover();
  await expect(page.locator('[data-map-readout]')).toContainText('Quiet falsehood.');
  await expect(dot).toHaveAttribute('class', /fill-pencil-blue/);
  await page.locator('svg a[href="/case/r_quiet_0001"]').click();
  await expect(page).toHaveURL(/\/case\/r_quiet_0001/);
});

test('every dot is reachable by keyboard and reads out on focus', async ({ page }) => {
  await withRuns(page);
  await page.goto('/runs');
  await page.getByRole('tab', { name: 'Map' }).click();
  const link = page.locator('svg a[href="/case/r_loud_0001"]');
  if (await link.isVisible()) {
    await link.focus();
    await expect(page.locator('[data-map-readout]')).toContainText('Loud falsehood.');
  } else {
    // Under 360px the plot is hidden and the table is the way in.
    await expect(page.locator('[data-map-table]')).toBeVisible();
  }
  await expect(page.locator('[data-map-table] a[href="/case/r_loud_0001"]')).toBeVisible();
});

test('empty: it says so and shows three recorded samples, labelled as samples', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/runs');
  const empty = page.locator('[data-empty-runs]');
  await expect(empty).toContainText('No checks yet on this browser.');
  await expect(empty.locator('[data-sample]')).toHaveCount(3);
  await expect(empty.locator('[data-sample]').first()).toContainText('Sample, a recorded check');
  await empty.locator('[data-sample]').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/case\/sample-/);
  await expect(page.getByText('a recorded example, not a new check')).toBeVisible();
});

test('it works with storage blocked', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await page.goto('/runs');
  await expect(page.locator('[data-empty-runs]')).toBeVisible();
});

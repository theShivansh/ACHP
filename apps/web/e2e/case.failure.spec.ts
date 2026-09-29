import { expect, test } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';

// S3.6 and 07 §3.3: a run that fails mid-way keeps what it found and shows no verdict; a message
// the Gatekeeper stops shows "Not checked", only the Gatekeeper as run, and no scores.

// Dev servers compile the route on first hit; a replay at 4× then takes a few seconds.
test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

test('a mid-run failure keeps the evidence, names the stage and shows no verdict', async ({ page }) => {
  const { name, events } = pickFixture('failed-midway', 'synthetic-failed-judge');
  const failed = events.find((e) => e.type === 'run.failed');
  expect(failed).toBeTruthy();
  const evidenceCount = events.filter((e) => e.type === 'evidence.found').length;
  const claimCount = events.filter((e) => e.type === 'claim.extracted').length;

  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator('[data-run-status="failed"]')).toBeVisible({ timeout: 60_000 });

  const card = page.locator('[data-failed-stage]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('The check stopped at the');
  await expect(card).toContainText('There is no verdict.');
  await expect(page.locator('[data-verdict]')).toHaveCount(0);
  await expect(page.locator('li[data-claim] [data-label]')).toHaveCount(0);

  await expect(page.locator('li[data-claim]')).toHaveCount(claimCount);
  await expect(page.locator('li[data-evidence]').first()).toBeAttached();
  expect(await page.locator('aside li[data-evidence]').count()).toBe(evidenceCount);
  // The lane that was working when the run died is shown as failed.
  await expect(page.locator('aside li[data-state="failed"]').first()).toBeAttached();
  await expect(page.locator('[data-status-line]')).toContainText('No verdict');
});

test('a blocked message: "Not checked", only the Gatekeeper ran, no scores', async ({ page }) => {
  const { name } = pickFixture('blocked', 'synthetic-blocked');
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-slot="stamp"][data-label="blocked"]')).toBeVisible();
  await expect(page.locator('[data-blocked]')).toContainText("wasn't checked");
  await expect(page.locator('[data-verdict]')).toHaveCount(0);
  await expect(page.locator('li[data-claim]')).toHaveCount(0);
  await expect(page.getByText(/\b(CTS|PCS|BIS|NSS|EPS)\b/)).toHaveCount(0);
  await expect(page.locator('aside li[data-agent="security_validator"]').first()).toHaveAttribute('data-state', 'done');
  const others = page.locator('aside li[data-agent]:not([data-agent="security_validator"])');
  const states = await others.evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
  expect(states.every((s) => s === 'skipped')).toBe(true);
});

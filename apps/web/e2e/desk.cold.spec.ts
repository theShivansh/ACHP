import { expect, test } from '@playwright/test';
import { mockBackend } from './site-mocks';

// A cold start (07 §3.3, S2.3): the chip says the desk is waking, with the seconds and the lamp; a claim submitted
// meanwhile stays on the sheet and the run starts only when /health answers; a failed /health is Unreachable with a
// Retry and its own backoff.

test.describe.configure({ timeout: 90_000 });

test('the chip wakes the desk, shows the lamp, and a submitted claim waits for it', async ({ page }) => {
  const { calls, answerHealth } = await mockBackend(page, { coldStart: true, libraries: [] });
  await page.goto('/');
  const chip = page.getByRole('status').filter({ hasText: 'Backend:' });
  await expect(chip).toContainText('Waking the desk');
  await expect(chip.locator('[data-glyph="lamp"]')).toBeVisible();
  // The seconds appear once the wait is noticeable.
  await expect(chip).toContainText(/Waking the desk · \d+s/, { timeout: 10_000 });

  await page.getByRole('textbox', { name: /The message you want checked/ }).fill('The Berlin Wall fell in 1989.');
  await page.getByRole('button', { name: 'Check this claim' }).click();
  // The claim stays on the sheet, and the page says why nothing has started.
  await expect(page.locator('[data-claim-input="sent"]')).toContainText('The Berlin Wall fell in 1989.');
  await expect(page.getByRole('status').filter({ hasText: /waking up/ })).toBeVisible();
  await page.waitForTimeout(800);
  expect(calls.runsPosted).toHaveLength(0);

  answerHealth();
  await expect(chip).toHaveText('Backend: Ready');
  await expect(page).toHaveURL(/\/case\//, { timeout: 30_000 });
  expect(calls.runsPosted).toHaveLength(1);
});

test('a failed /health reads Unreachable, retries by itself and offers Retry now', async ({ page }) => {
  let hits = 0;
  await page.route(/\/health$/, (route) => {
    hits += 1;
    if (hits < 3) return route.fulfill({ status: 503, body: '' });
    return route.fulfill({ json: { status: 'ok' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route(/\/kb\/list$/, (route) => route.fulfill({ json: { total: 0, knowledge_bases: [] }, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  const chip = page.getByRole('status').filter({ hasText: 'Backend:' });
  await expect(chip).toContainText('Unreachable');
  await expect(chip).toContainText('retrying in 2s');
  await expect(chip.getByRole('button', { name: 'Retry' })).toBeVisible();
  // Retry now skips the wait; the next answer is the third and succeeds.
  await chip.getByRole('button', { name: 'Retry' }).click();
  await expect(chip).toContainText(/Unreachable|Ready/);
  await expect(chip).toHaveText('Backend: Ready', { timeout: 15_000 });
});

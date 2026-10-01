import { expect, test } from '@playwright/test';
import { mockBackend } from './site-mocks';

// A blocked message (07 §3.3, paper Fig. 8, S10.9): a graphite "Not checked" stamp, the reason in words, only the
// Gatekeeper ran, and no metrics, no Hallmark, no made-up number. The old UI printed "BIS 100%" here; nothing may.

test.describe.configure({ timeout: 90_000 });

test('a blocked message shows Not checked, the reason, only the Gatekeeper, and no scores at all', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/fixture-blocked?speed=20');
  await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });

  await expect(page.locator('[data-slot="stamp"]').first()).toHaveAttribute('aria-label', /Not checked/);
  await expect(page.locator('[data-slot="stamp"]').first()).toHaveAttribute('data-label', 'blocked');
  await expect(page.locator('[data-blocked-notice], [data-verdict="blocked"]').first().or(page.getByText(/not checked/i).first())).toBeVisible();

  // No metrics of any kind.
  await expect(page.locator('[data-hallmark]')).toHaveCount(0);
  await expect(page.locator('[data-cartouche]')).toHaveCount(0);
  await expect(page.locator('[data-two-key]')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'The Assay' })).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\bBIS\b|\bCTS\b|\bPCS\b|\bNSS\b|\bEPS\b/);
  expect(text).not.toMatch(/\d+\s?%/);

  // Only the Gatekeeper ran; the others did not start.
  const states = await page.locator('li[data-agent]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-agent')}:${e.getAttribute('data-state')}`));
  expect(states.find((s) => s.startsWith('security_validator'))).toBe('security_validator:done');
  for (const s of states.filter((x) => !x.startsWith('security_validator'))) expect(s).toMatch(/:skipped$/);
});

test('a blocked message is never a point on the Integrity Map or a row with scores', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/runs');
  // Sample cases are listed with their stamps only; none of them offers a score for a blocked run.
  await expect(page.locator('[data-empty-runs]')).toBeVisible();
  await expect(page.locator('[data-sample]')).toHaveCount(3);
});

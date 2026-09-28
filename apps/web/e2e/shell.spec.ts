import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Smoke: the flagged desk shell renders a case sheet for any case id (live, expired or waking,
// depending on the backend this dev server points at) and has no axe violations.
test('desk shell renders a case sheet', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.goto('/case/demo-shell');
  await expect(page.locator('[data-run-status]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

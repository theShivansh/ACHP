import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// P1 smoke: the flagged desk shell renders a sheet for a case id and has no axe violations.
test('desk shell renders the case placeholder', async ({ page }) => {
  await page.goto('/case/demo-shell');
  await expect(page.getByRole('heading', { name: 'Case demo-shell' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

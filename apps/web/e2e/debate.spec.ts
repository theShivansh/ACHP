import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { healthOk } from './case-fixtures';

// The debate tab: what each reviewer concluded, as a transparency report. Conclusions only, no percentages, no bare
// acronyms, and an honest notice for a run whose server did not store them.

test.describe.configure({ timeout: 90_000 });
const done = '[data-run-status="completed"]';

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

test('The debate shows the challenger, the auditor, the wording check and the sources, in plain words', async ({ page }) => {
  await page.goto('/case/fixture-synthetic-mixed?speed=50&tab=debate');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'The debate' })).toHaveAttribute('aria-selected', 'true');
  const tab = page.locator('[data-debate="found"]');
  await expect(tab).toContainText('Their reasoning is not shown, only what they found.');
  await expect(tab.locator('[data-debate-part="challenger"]')).toContainText(/Tested \d parts? against the sources/);
  await expect(tab.locator('[data-debate-part="challenger"]')).toContainText('Flaws it named');
  await expect(tab.locator('[data-missing] li').first()).toContainText('Older adults');
  await expect(tab.locator('[data-debate-part="integrity"]')).toContainText('Mildly biased');
  await expect(tab.locator('[data-debate-part="sources"]')).toContainText(/Part 1: \d sources? back/);
  // Never a percentage, a bare score acronym or the model's reasoning.
  const text = await tab.innerText();
  expect(text).not.toMatch(/%|\bBIS\b|\bEPS\b|\bPCS\b|\bNIL\b|chain of thought/i);
  // The names come from the run, and the sources button goes to the Evidence tab.
  await tab.getByRole('button', { name: 'Open the sources' }).click();
  await expect(page).toHaveURL(/tab=evidence/);
});

test('a run without a record says so, and nothing breaks', async ({ page }) => {
  await page.goto('/case/fixture-exercise-mixed?speed=50&tab=debate'); // recorded before this event existed
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-debate="none"]')).toContainText('no record of what the reviewers found');
});

test('a blocked message has no debate tab', async ({ page }) => {
  await page.goto('/case/fixture-blocked?speed=50');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'The debate' })).toHaveCount(0);
});

test('the debate tab has no axe violations', async ({ page }) => {
  await page.goto('/case/fixture-synthetic-mixed?speed=50&tab=debate');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

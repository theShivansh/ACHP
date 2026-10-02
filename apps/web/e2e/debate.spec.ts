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

test('The debate shows what was searched and read, what each reviewer said, and the findings, in plain words', async ({ page }) => {
  await page.goto('/case/fixture-synthetic-mixed?speed=50&tab=debate');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'The debate' })).toHaveAttribute('aria-selected', 'true');
  const tab = page.locator('[data-debate="found"]');
  await expect(tab).toContainText('Their reasoning is not shown');
  // What was searched and the excerpts it pinned, verbatim, each with what it was used for.
  await expect(tab.locator('[data-debate-part="search"]')).toContainText(/Searching the web|search/i);
  await expect(tab.locator('[data-excerpt]').first()).toContainText('Source 1');
  await expect(tab.locator('[data-excerpt] blockquote').first()).not.toBeEmpty();
  await expect(tab.locator('[data-excerpt]').first()).toContainText(/Supports|Contradicts|Adds context|Frames|Touches|not cited/);
  // What each reviewer said, in its own published sentence, and what it concluded.
  await expect(tab.locator('[data-said]').first()).toContainText('In its words');
  await expect(tab.locator('[data-debate-part="challenger"]')).toContainText(/Tested \d parts? against the sources/);
  await expect(tab.locator('[data-debate-part="challenger"]')).toContainText('Flaws it named');
  await expect(tab.locator('[data-missing] li').first()).toContainText('Older adults');
  await expect(tab.locator('[data-debate-part="integrity"]')).toContainText('Mildly biased');
  await expect(tab.locator('[data-debate-part="sources"]')).toContainText(/Part 1: \d sources? back/);
  // Our own wording never has a percentage, a bare score acronym or the model's reasoning (quoted sources may have a %).
  const ours = await tab.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-excerpts]').forEach((n) => n.remove());
    return clone.innerText;
  });
  expect(ours).not.toMatch(/%|BIS|EPS|PCS|NIL|chain of thought/i);
  await tab.getByRole('button', { name: 'Open the sources' }).click();
  await expect(page).toHaveURL(/tab=evidence/);
});

test('a run whose server stored no findings still shows the search, the excerpts and what each reviewer said', async ({ page }) => {
  await page.goto('/case/fixture-exercise-mixed?speed=50&tab=debate'); // recorded before the findings event existed
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const tab = page.locator('[data-debate="partial"]');
  await expect(tab.locator('[data-debate-none]')).toContainText('did not store the reviewers');
  await expect(tab.locator('[data-excerpt]').first()).toBeVisible();
  await expect(tab.locator('[data-said]').first()).toBeVisible();
});

test('a part nobody could settle says why, from the log', async ({ page }) => {
  await page.goto('/case/fixture-synthetic-edge-all-unverifiable?speed=50&tab=debate');
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const why = page.locator('[data-why-unsettled]');
  await expect(why).toContainText('Why it was not settled');
  await expect(why).toContainText(/nothing to settle it against|none was cited|none settled/);
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

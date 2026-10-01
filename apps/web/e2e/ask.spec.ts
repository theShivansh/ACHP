import { expect, test } from '@playwright/test';
import { KB_READY, mockBackend, seedStorage } from './site-mocks';

// Ask a library (07 §6, S8.1): numbered citations that open their passages, similarity in words, and a library that
// cannot answer says so and offers to check the question as a claim.

test.describe.configure({ timeout: 60_000 });

test('an answer carries numbered citations, and a citation opens its passage', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [KB_READY] });
  await seedStorage(page, { 'achp.activeKb.v1': 'kb1' });
  await page.goto('/ask');
  await expect(page.locator('[data-library-size]')).toHaveText('3 documents · 48 chunks');
  await page.getByRole('textbox', { name: 'Your question' }).fill('How much exercise does WHO recommend per week?');
  await page.getByRole('button', { name: 'Ask' }).click();
  const answer = page.locator('[data-exchange]').first();
  await expect(answer).toContainText('at least 150 minutes');
  expect(calls.asked).toEqual(['How much exercise does WHO recommend per week?']);

  // Two chips, numbered in the order first cited; each opens its passage (chunk index and a similarity in words).
  const chips = answer.locator('[data-cite]');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveText('1');
  await expect(chips.nth(1)).toHaveText('2');
  await chips.nth(1).click();
  const card = answer.locator('[data-quote-card="1"]');
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('data-active', 'true');
  await expect(card).toContainText('Chunk 1');
  await expect(card).toContainText('partial match');
  // The first passage is a close match; the number is in the tooltip, not the headline.
  await expect(answer.locator('[data-quote-card="0"]')).toContainText('close match');
  await expect(answer.locator('[data-quote-card="0"]')).not.toContainText('0.71');
  // The passage that was retrieved but not cited is listed apart.
  await expect(answer.getByText('1 other passage was retrieved, not cited')).toBeVisible();
});

test('a question the library cannot answer says so, shows the nearest passages and offers a claim check', async ({ page }) => {
  await mockBackend(page, { libraries: [KB_READY] });
  await seedStorage(page, { 'achp.activeKb.v1': 'kb1' });
  await page.goto('/ask');
  await page.locator('[data-library-size]').waitFor();
  await page.getByRole('textbox', { name: 'Your question' }).fill('Who won the 1998 football World Cup?');
  await page.getByRole('button', { name: 'Ask' }).click();
  const out = page.locator('[data-out-of-library]');
  await expect(out.getByText('Not in this library.')).toBeVisible();
  await expect(out.getByRole('list', { name: 'Nearest passages' }).getByRole('listitem')).toHaveCount(3);
  // The nearest passages are not dressed as an answer: no citation chips.
  await expect(page.locator('[data-cite]')).toHaveCount(0);
  const link = out.getByRole('link', { name: 'Check it as a claim instead' });
  await expect(link).toHaveAttribute('href', /^\/\?claim=Who%20won%20the%201998/);
  await link.click();
  await expect(page.getByRole('textbox', { name: /The message you want checked/ })).toHaveValue('Who won the 1998 football World Cup?');
});

test('with no libraries it says what a library is and points to the upload', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/ask');
  await expect(page.locator('[data-empty-libraries]')).toContainText('Libraries let ACHP answer from your own documents');
  await expect(page.getByRole('link', { name: 'Add documents' })).toHaveAttribute('href', '/library');
});

test('asking without a library, or without a question, says what is missing', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/ask');
  await page.locator('[data-library-size], select').first().waitFor();
  await page.getByRole('textbox', { name: 'Your question' }).fill('How much exercise per week?');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a library' })).toBeVisible();
  expect(calls.asked).toHaveLength(0);
});

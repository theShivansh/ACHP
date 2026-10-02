import { expect, test } from '@playwright/test';
import { KB_ERROR, KB_INDEXING, KB_READY, mockBackend } from './site-mocks';

// Libraries (07 §7, S8.2): index cards with a real status, an upload (a file, a web address or text), a confirmation
// dialog before delete (never a browser confirm), and one library's chunks with a search box. The API is mocked in the
// browser; every existing KB call is the same one the old manager made.

test.describe.configure({ timeout: 60_000 });

test('index cards say what each library is and what state it is really in', async ({ page }) => {
  await mockBackend(page, { libraries: [KB_READY, KB_INDEXING, KB_ERROR] });
  await page.goto('/library');
  const ready = page.locator('[data-kb="kb1"]');
  await expect(ready).toContainText('Health KB');
  await expect(ready).toContainText('3 docs · 48 chunks · 117 KB');
  await expect(ready.locator('[data-kb-status]')).toHaveText('Ready');
  await expect(page.locator('[data-kb="kb2"] [data-kb-status]')).toContainText('Indexing');
  await expect(page.locator('[data-kb="kb3"] [data-kb-status]')).toContainText('Could not be indexed');
  // Only a ready library can be asked or made active.
  await expect(page.locator('[data-kb="kb2"]').getByRole('link', { name: /^Ask/ })).toHaveCount(0);
  await expect(page.locator('[data-kb="kb1"]').getByRole('link', { name: /^Ask/ })).toBeVisible();
});

test('"Set active" marks one library and it is kept', async ({ page }) => {
  await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/library');
  await page.getByRole('button', { name: /^Set active/ }).click();
  await expect(page.locator('[data-kb="kb1"] [data-active-chip]')).toHaveText('Active');
  await page.reload();
  await expect(page.locator('[data-kb="kb1"] [data-active-chip]')).toHaveText('Active');
});

test('uploading a file adds a library and says so', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/library');
  await page.locator('[data-file-input]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Some notes about exercise and health.') });
  await expect(page.getByRole('status').filter({ hasText: 'Added “Uploaded notes”: 7 chunks. It is ready.' })).toBeVisible();
  expect(calls.uploads).toBe(1);
  await expect(page.locator('[data-kb="kb9"]')).toContainText('Uploaded notes');
});

test('pasted text and a web address are added from their own fields', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [] });
  await page.goto('/library');
  await expect(page.locator('[data-empty-libraries]')).toContainText('Libraries let ACHP check claims against your own documents');
  await expect(page.getByRole('button', { name: 'Add text' })).toBeDisabled();
  await page.getByLabel('Or paste text').fill('A paragraph about sleep and memory.');
  await page.getByRole('button', { name: 'Add text' }).click();
  await expect.poll(() => calls.uploads).toBe(1);
  await page.getByLabel('Or paste a web address').fill('https://example.org/article');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => calls.uploads).toBe(2);
});

test('delete asks in a dialog first; Cancel changes nothing; Delete removes it', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [KB_READY, KB_ERROR] });
  let nativeConfirm = false;
  page.on('dialog', (d) => {
    nativeConfirm = true;
    void d.dismiss();
  });
  await page.goto('/library');
  await page.getByRole('button', { name: /Delete Old notes/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete “Old notes”?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.deleted).toHaveLength(0);
  // Focus goes back to the button that opened the dialog.
  await expect(page.getByRole('button', { name: /Delete Old notes/ })).toBeFocused();

  await page.getByRole('button', { name: /Delete Old notes/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete library' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted “Old notes”.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted “Old notes”.' })).toBeFocused();
  expect(calls.deleted).toEqual(['kb3']);
  await expect(page.locator('[data-kb="kb3"]')).toHaveCount(0);
  expect(nativeConfirm).toBe(false);
});

test('one library lists its chunks, and the search box narrows them', async ({ page }) => {
  await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/library/kb1');
  await expect(page.getByRole('heading', { level: 1, name: 'Health KB' })).toBeVisible();
  await expect(page.locator('[data-kb-facts]')).toContainText('3 documents · 48 chunks');
  await expect(page.locator('[data-chunk]')).toHaveCount(3);
  await page.getByLabel('Search the chunks').fill('falls');
  await expect(page.locator('[data-chunk]')).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: '1 of 3 chunks match.' })).toBeVisible();
  // A long chunk shows its start and opens in place.
  await page.getByLabel('Search the chunks').fill('');
  await page.locator('[data-chunk="0"]').getByRole('button', { name: /Read the whole chunk/ }).click();
  await expect(page.locator('[data-chunk="0"]')).toContainText('or an equivalent combination');
  await expect(page.getByRole('link', { name: 'Ask this library' })).toHaveAttribute('href', '/ask');
});

test('a library that is not there says so', async ({ page }) => {
  await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/library/kb404');
  await expect(page.getByRole('heading', { name: 'That library is not here.' })).toBeVisible();
});

test('a file the backend cannot read is refused on the page, with the reason, and nothing is sent', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [] });
  await page.goto('/library');
  await page.locator('[data-file-input]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('not a document') });
  await expect(page.locator('[data-dropzone] [role="alert"]')).toContainText('not a file a library can read');
  await page.getByLabel('Or paste text').fill('too short');
  await page.getByRole('button', { name: 'Add text' }).click();
  await expect(page.locator('[data-dropzone] [role="alert"]')).toContainText('at least 10 characters');
  expect(calls.uploads).toBe(0);
});

import { expect, test } from '@playwright/test';
import { KB_READY, mockBackend } from './site-mocks';

// The Desk (07 §2, S2.1, S2.2): the headline, the sheet, three neutral examples that fill but never submit, a twelve
// character minimum with the shake, a library selector only when libraries exist, ⌘K, the theme choice, and a
// check that opens the case. ACHP has no sound control.

test.describe.configure({ timeout: 90_000 });

test('the Desk says what it does, and has a place to paste a message', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before you forward it, check it.');
  await expect(page.getByText('Seven specialist agents take a claim apart')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /The message you want checked/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check this claim' })).toBeVisible();
  // No library yet: no selector, no empty control.
  await expect(page.getByLabel(/^Library/)).toHaveCount(0);
  // No sound control anywhere in the chrome.
  await expect(page.getByRole('button', { name: /sound|mute|audio|volume/i })).toHaveCount(0);
});

test('three neutral examples fill the field and are never submitted', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [] });
  await page.goto('/');
  const examples = page.getByRole('list').filter({ has: page.getByRole('button', { name: /Berlin Wall/ }) }).getByRole('button');
  await expect(examples).toHaveCount(3);
  await page.getByRole('button', { name: /The Berlin Wall fell in 1989/ }).click();
  await expect(page.getByRole('textbox', { name: /The message you want checked/ })).toHaveValue('The Berlin Wall fell in 1989.');
  await expect(page.getByRole('textbox', { name: /The message you want checked/ })).toBeFocused();
  expect(calls.runsPosted).toHaveLength(0);
  // None of them is an inflammatory claim.
  for (const t of await examples.allTextContents()) expect(t).not.toMatch(/immigra|hoax|china|terror|vaccin/i);
});

test('a message under twelve characters shakes the field, says what is missing and sends nothing', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [] });
  await page.goto('/');
  await page.getByRole('textbox', { name: /The message you want checked/ }).fill('too short');
  await page.getByRole('button', { name: 'Check this claim' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least 12 characters' })).toBeVisible();
  expect(calls.runsPosted).toHaveLength(0);
});

test('a library selector appears when libraries exist, and the check carries the chosen one', async ({ page }) => {
  const { calls } = await mockBackend(page, { libraries: [KB_READY] });
  await page.goto('/');
  const select = page.getByLabel('Library:');
  await expect(select).toBeVisible();
  await select.selectOption('kb1');
  await page.getByRole('textbox', { name: /The message you want checked/ }).fill('Regular exercise cuts the risk of heart disease.');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => calls.runsPosted.length).toBe(1);
  expect(calls.runsPosted[0].body).toMatchObject({ input: { type: 'text' }, kb_id: 'kb1' });
});

test('checking a message starts the run and opens the case', async ({ page }, info) => {
  const { calls } = await mockBackend(page, { libraries: [], runId: 'sample-exercise-mixed' });
  await page.goto('/');
  await page.getByRole('textbox', { name: /The message you want checked/ }).fill('Regular exercise cuts the risk of heart disease by 30 to 40 percent.');
  await page.getByRole('button', { name: 'Check this claim' }).click();
  await expect(page).toHaveURL(/\/case\/sample-exercise-mixed/, { timeout: 30_000 });
  expect(calls.runsPosted).toHaveLength(1);
  expect(info.project.name).toBeTruthy();
});

test('⌘K or Ctrl+K opens the command menu and a command goes there', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the shortcut is a keyboard path');
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await expect(menu).toBeVisible();
  for (const name of ['New check', 'Ask a library', 'Libraries', 'Your checks', 'How ACHP decides', 'For developers', 'Change theme']) {
    await expect(menu.getByRole('option', { name })).toBeVisible();
  }
  // Case commands only exist on a case.
  await expect(menu.getByRole('option', { name: 'Open the Assay' })).toHaveCount(0);
  await menu.getByRole('option', { name: 'How ACHP decides' }).click();
  await expect(page).toHaveURL(/\/method$/);
  // Escape closes it and gives focus back.
  await page.keyboard.press('Control+k');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('on a case the menu offers the Assay, the trace and the replay', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the shortcut is a keyboard path');
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/sample-exercise-mixed');
  await page.keyboard.press('Control+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await expect(menu.getByRole('option', { name: 'Open the Assay' })).toBeVisible();
  await menu.getByRole('option', { name: 'Open the trace' }).click();
  await expect(page).toHaveURL(/tab=trace/);
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveAttribute('aria-selected', 'true');
});

test('the theme cycles system, light, dark and is remembered', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the toggle is in the menu on a phone (see the menu test)');
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  const toggle = page.locator('header [data-theme-choice]').first();
  await expect(toggle).toHaveAttribute('data-theme-choice', 'system');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-theme-choice', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('on a phone the header is the wordmark, the status and a menu that holds the nav and the theme', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'), 'the phone header');
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  for (const l of ['Check', 'Ask', 'Library', 'Runs', 'Method', 'Developers']) await expect(menu.getByRole('link', { name: l, exact: true })).toBeVisible();
  await menu.getByRole('button', { name: /Theme/ }).click();
  await expect(menu.getByRole('button', { name: /Theme/ })).toContainText('Light');
});

test('below the fold the recorded check replays, and ends by taking you back to the field', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'How a check works' })).toBeAttached();
  await expect(page.locator('[data-story]')).toBeAttached();
  await page.locator('#home-cta').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Check a message' }).click();
  await expect(page.getByRole('textbox', { name: /The message you want checked/ })).toBeFocused();
});

test('the story rail belongs to the story: it is not on screen above the fold, and appears with the story', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/');
  await expect(page.locator('[data-story-rail]')).toBeHidden();
  await page.locator('#how-it-works').scrollIntoViewIfNeeded();
  // The observer may not have taken its first reading under load, so scroll again until the rail answers.
  await expect(async () => {
    await page.evaluate(() => document.querySelector('[data-chapter="sources"]')?.scrollIntoView({ block: 'center' }));
    await expect(page.locator('[data-story-rail]')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[data-story-rail]')).toBeHidden();
});

test('a recorded example says so on every screen size, so it is never taken for a new check', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/case/sample-exercise-mixed');
  await expect(page.locator('[data-recorded-notice]')).toHaveText('A recorded example, not a new check.');
  await expect(page.locator('[data-recorded-notice]')).toBeVisible();
});

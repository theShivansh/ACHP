import { expect, test } from '@playwright/test';

// The status chip mirrors GET /health (never a guess), and the case pages keep the nav in the menu.

test.describe('backend status chip', () => {
  test('reads "Waking the desk" while /health is in flight', async ({ page }) => {
    await page.route('**/health', () => {}); // never answered
    await page.goto('/case/chip-waking');
    await expect(page.getByRole('status')).toHaveText('Backend: Waking the desk');
    await page.screenshot({ path: test.info().outputPath('chip-waking.png') });
  });

  test('reads "Ready" when /health answers ok', async ({ page }) => {
    await page.route('**/health', (route) =>
      route.fulfill({ json: { status: 'ok', pipeline_mode: 'online', kb_count: 0 } }),
    );
    await page.goto('/case/chip-ready');
    await expect(page.getByRole('status')).toHaveText('Backend: Ready');
    await page.screenshot({ path: test.info().outputPath('chip-ready.png') });
  });

  test('reads "Unreachable" when /health fails', async ({ page }) => {
    await page.route('**/health', (route) => route.fulfill({ status: 503, body: '' }));
    await page.goto('/case/chip-down');
    await expect(page.getByRole('status')).toHaveText('Backend: Unreachable');
  });
});

test('case pages keep the nav behind the menu, on the desk surface', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.goto('/case/menu');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('data-surface', 'desk');
  await expect(menu.getByRole('link', { name: 'Library' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Close' })).toBeInViewport();
  // Capture the settled sheet, not a frame of its slide-in.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.screenshot({ path: test.info().outputPath('menu-open.png') });
});

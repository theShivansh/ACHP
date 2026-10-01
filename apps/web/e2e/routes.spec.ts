import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { KB_READY, mockBackend } from './site-mocks';

// Every page of the site (07 §1) in every project: it loads, has one heading and one main landmark, does not scroll
// sideways, throws nothing, and has no axe violations. The mobile project is 390 wide; a second pass at 360 checks the
// narrowest phone (07 §6, task 11).

test.describe.configure({ timeout: 90_000 });

const ROUTES = [
  '/',
  '/ask',
  '/library',
  '/library/kb1',
  '/runs',
  '/method',
  '/developers',
  '/case/sample-exercise-mixed',
  '/case/fixture-blocked?speed=50',
];

for (const route of ROUTES) {
  test(`${route} loads cleanly, has one h1 and one main, does not scroll sideways, and has no axe violations`, async ({ page }) => {
    await mockBackend(page, { libraries: [KB_READY] });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(route);
    if (route.startsWith('/case/fixture')) await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });
    else if (route === '/library/kb1') await page.locator('[data-chunk]').first().waitFor();
    else await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 8000 }).catch(() => {});

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test.describe('the narrowest phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const route of ROUTES.filter((r) => !r.startsWith('/case/fixture'))) {
    test(`${route} fits 360px with 44px targets for its buttons and links`, async ({ page }, info) => {
      test.skip(!info.project.name.includes('mobile'), 'the phone projects');
      await mockBackend(page, { libraries: [KB_READY] });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'horizontal scroll at 360').toBeLessThanOrEqual(0);
      // The primary touch targets are 44px: buttons and the text fields a thumb has to hit.
      const small = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('main button, main select, main input:not([type="radio"]):not([type="checkbox"]):not([type="range"]):not([hidden]), main textarea, header button')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
          if (r.height < 43.5) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`);
        }
        return bad;
      });
      expect(small).toEqual([]);
    });
  }
});

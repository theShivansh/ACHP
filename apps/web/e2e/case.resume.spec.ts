import { expect, test } from '@playwright/test';
import { finalLaneStates, healthOk, pickFixture } from './case-fixtures';

// S1.2 on the page: the stream drops mid-run, the connection reconnects with the last seq it applied,
// and the page ends in the same state as an uninterrupted run, with nothing shown twice.

const { name, events } = pickFixture('exercise-mixed', 'synthetic-mixed');
const dropAt = Math.floor(events.length / 2);
const evidenceCount = events.filter((e) => e.type === 'evidence.found').length;
const claimCount = events.filter((e) => e.type === 'claim.extracted').length;

// Dev servers compile the route on first hit; a replay at 4× then takes a few seconds.
test.describe.configure({ timeout: 90_000 });

test('a dropped stream resumes after the last applied event and finishes cleanly', async ({ page }) => {
  await healthOk(page);
  const streams: string[] = [];
  page.on('request', (r) => {
    if (/\/runs\/[^/]+\/events(\?|$)/.test(r.url())) streams.push(r.url());
  });

  await page.goto(`/case/fixture-${name}?speed=4&drop=${dropAt}`);
  // The drop shows as a reconnect, in words, before the run finishes.
  const banner = page.locator('[data-interrupted]').filter({ hasText: 'Lost connection' });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-run-status="completed"]')).toBeVisible({ timeout: 60_000 });
  await expect(banner).toHaveCount(0);

  expect(streams.length).toBeGreaterThanOrEqual(2);
  expect(streams.some((u) => u.includes(`since=${dropAt}`))).toBe(true);

  await expect(page.locator('li[data-claim]')).toHaveCount(claimCount);
  const ids = await page.locator('li[data-evidence]').evaluateAll((els) => els.map((e) => e.getAttribute('data-evidence')));
  expect(new Set(ids).size).toBe(ids.length); // no card twice
  expect(new Set(ids).size).toBe(evidenceCount);
  for (const [agent, state] of Object.entries(finalLaneStates(events))) {
    await expect(page.locator(`aside li[data-agent="${agent}"]`).first()).toHaveAttribute('data-state', state);
  }
});

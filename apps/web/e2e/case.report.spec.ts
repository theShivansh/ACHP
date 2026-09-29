import { expect, test } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';
import { initialRunState, reduceRun } from '../lib/runs/reducer';
import { VERDICTS } from '../lib/verdict';

// P4: the completed fixture becomes a report a non-expert can read, and every statement in it
// traces to an event. Expectations come from the log itself.

const { name, events } = pickFixture('exercise-mixed', 'synthetic-mixed');
const state = events.reduce(reduceRun, initialRunState());
const verdict = state.verdict!;
const done = '[data-run-status="completed"]';
const url = `/case/fixture-${name}?speed=20`;

test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

test('stamps carry the labels, the summary and band are in words, and there is no percent sign', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });

  const overall = page.locator('article > header [data-slot="stamp"]');
  await expect(overall).toHaveAttribute('data-label', verdict.overall.label);
  await expect(overall).toHaveAttribute('aria-label', `Verdict: ${VERDICTS[verdict.overall.label].name}`);

  for (const c of verdict.claims) {
    const stamp = page.locator(`li[data-claim="${c.claim_id}"] [data-slot="stamp"]`);
    await expect(stamp).toHaveAttribute('data-label', c.label);
  }

  await expect(page.locator('[data-interpretation]')).toContainText(verdict.overall.summary);
  const band = page.locator('[data-band]');
  await expect(band).toHaveAttribute('data-band', verdict.overall.confidence_band);
  await expect(band).toContainText(verdict.overall.confidence_reason);
  await expect(band).toContainText(/evidence\./);

  // No % anywhere in the Report tab (04 §2: no bare percentages).
  const text = await page.getByRole('tabpanel').innerText();
  expect(text).not.toContain('%');
});

test('an evidence card shows where it came from, the verbatim quote and what it was used for', async ({ page }) => {
  await page.goto(`${url}&tab=evidence`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const first = state.evidence[state.evidenceOrder[0]];
  const card = page.getByRole('tabpanel').locator(`li[data-evidence="${first.evidence_id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText(first.source.domain ?? '');
  if (first.source.title) await expect(card).toContainText(first.source.title);
  await expect(card.locator('blockquote')).toContainText(first.quote.trim().replace(/^["“'‘]/, '').trim().slice(0, 50));
  await expect(card).toContainText(/Published|Date not given/);
  await expect(card.getByRole('link', { name: /Open source/ })).toHaveAttribute('href', first.source.url ?? '');
  await expect(card.locator('blockquote')).toHaveClass(/font-display/); // the quote is Newsreader; the reading is not
});

test('focusing a card lights its strips and dims the rest; focusing a strip lights its cards', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) < 1280, 'the tray and the strips are side by side at ≥1280px');
  await page.goto(url);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });

  const cards = page.getByRole('complementary', { name: 'Evidence' }).locator('li[data-evidence]');
  await cards.first().focus();
  await expect(cards.first()).toHaveAttribute('data-link', 'active');
  const strips = page.locator('li[data-claim]');
  const linkOf = await strips.evaluateAll((els) => els.map((e) => e.getAttribute('data-link')));
  expect(linkOf.every((l) => l === 'related' || l === 'dimmed')).toBe(true);
  expect(linkOf).toContain('related');
  const others = await cards.evaluateAll((els) => els.slice(1).map((e) => e.getAttribute('data-link')));
  expect(others.every((l) => l === 'dimmed')).toBe(true);

  await page.locator('h1').click(); // focus leaves the card: everything is idle again
  await cards.first().blur();
  await expect(cards.first()).toHaveAttribute('data-link', 'idle');

  await strips.first().getByRole('button', { name: /source/ }).focus();
  await expect(strips.first()).toHaveAttribute('data-link', 'active');
  const cardLinks = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-link')));
  expect(cardLinks).toContain('related');
});

test('the tabs work by keyboard, live in the URL, and the Trace lists every event', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const tabs = page.getByRole('tablist', { name: 'Case sections' });
  await tabs.getByRole('tab', { name: 'Report' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: /Evidence/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=evidence/);
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Trace' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=trace/);

  const trace = page.locator('[data-trace]');
  await expect(trace.locator('[data-event-count]')).toHaveText(`${events.length} events`);
  await expect(trace.locator('table')).toHaveAttribute('aria-rowcount', String(events.length + 1));
  // The first row expands to the raw JSON of that event.
  await trace.getByRole('button', { name: /run\.started/ }).click();
  await expect(trace.locator('pre').first()).toContainText('"type": "run.started"');
});

test('"Copy summary" is at most 400 characters and ends with the case link', async ({ page, context }, info) => {
  test.skip(info.project.name.includes('mobile'), 'clipboard permissions are set up for the desktop projects');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Copy summary' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.length).toBeLessThanOrEqual(400);
  expect(copied).toContain(`ACHP: ${VERDICTS[verdict.overall.label].name}.`);
  expect(copied.trim().endsWith(`/case/${events[0].run_id}`)).toBe(true);
});

test('the report has no axe violations on any tab', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const tab of ['report', 'evidence', 'trace']) {
    await page.goto(`${url}&tab=${tab}`);
    await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${tab} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});

test('the page title and the share image name the verdict', async ({ page, request }) => {
  await page.goto(url);
  const info = VERDICTS[verdict.overall.label];
  await expect(page).toHaveTitle(new RegExp(`^ACHP · ${info.name}: `));
  const ogUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogUrl).toBeTruthy();
  const res = await request.get(ogUrl!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  expect((await res.body()).length).toBeGreaterThan(10_000);
});

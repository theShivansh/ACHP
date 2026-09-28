import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  expectedTransitions,
  finalLaneStates,
  healthOk,
  orderProblems,
  pickFixture,
  type SeenTransition,
  watchLanes,
} from './case-fixtures';

// The live investigation board (P3, S3.1–S3.5): a fixture replayed at 4× through the same
// endpoints the backend serves. Every assertion is derived from the log itself.

const { name, events } = pickFixture('exercise-mixed', 'synthetic-mixed');
const claims = events.flatMap((e) => (e.type === 'claim.extracted' ? [e.data.claim] : []));
const marks = events.flatMap((e) => (e.type === 'claim.marked' ? [e.data] : []));
const evidenceCount = events.filter((e) => e.type === 'evidence.found').length;
const done = '[data-run-status="completed"]';

// Dev servers compile the route on first hit; a replay at 4× then takes a few seconds.
test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

test('lanes change state in event order and end where the log ends', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) < 1280, 'the full lanes column shows at ≥1280px');
  await watchLanes(page);
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });

  const seen = await page.evaluate(() => (window as unknown as { __lanes: SeenTransition[] }).__lanes);
  expect(seen.length).toBeGreaterThan(0);
  expect(orderProblems(seen, expectedTransitions(events))).toEqual([]);

  const lanes = page.getByRole('complementary', { name: 'Agents' }).locator('li[data-agent]');
  for (const [agent, state] of Object.entries(finalLaneStates(events))) {
    await expect(lanes.and(page.locator(`[data-agent="${agent}"]`))).toHaveAttribute('data-state', state);
  }
  // The parallel group is labelled.
  await expect(page.getByText('In parallel')).toBeVisible();
});

test('strips appear in reading order, and marks sit over the exact characters', async ({ page }) => {
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });

  const strips = page.locator('li[data-claim]');
  await expect(strips).toHaveCount(claims.length);
  const inOrder = [...claims].sort((a, b) => a.source_span[0] - b.source_span[0]).map((c) => c.claim_id);
  expect(await strips.evaluateAll((els) => els.map((e) => e.getAttribute('data-claim')))).toEqual(inOrder);
  for (const c of claims) {
    await expect(page.locator(`li[data-claim="${c.claim_id}"]`)).toContainText(c.text);
  }

  // Compare each mark's box with the browser's own Range boxes for its span.
  const offsets = await page.evaluate(() => {
    const out: { claim: string; span: string; dx: number; dw: number; dy: number }[] = [];
    for (const li of document.querySelectorAll('li[data-claim]')) {
      const box = li.querySelector('p.relative');
      const text = box?.querySelector('span:not(.sr-only)')?.firstChild;
      if (!box || !(text instanceof Text)) continue;
      const byLine = new Map<string, SVGElement[]>();
      li.querySelectorAll<SVGElement>('svg.mark').forEach((svg) => {
        const k = svg.getAttribute('data-span')!;
        byLine.set(k, [...(byLine.get(k) ?? []), svg]);
      });
      for (const [span, svgs] of byLine) {
        const [a, b] = span.split(',').map(Number);
        const r = document.createRange();
        r.setStart(text, a);
        r.setEnd(text, b);
        const lines = [...r.getClientRects()].filter((x) => x.width > 0.5);
        const first = lines[0];
        const svgBox = svgs[0].getBoundingClientRect();
        const lineRight = Math.max(...lines.filter((l) => Math.abs(l.top - first.top) < 2).map((l) => l.right));
        out.push({
          claim: li.getAttribute('data-claim')!,
          span,
          dx: Math.abs(svgBox.left - first.left),
          dw: Math.abs(svgBox.right - lineRight),
          dy: Math.abs(svgBox.top - first.top),
        });
      }
    }
    return out;
  });
  expect(offsets.length).toBe(new Set(marks.map((m) => `${m.claim_id}:${m.span}`)).size);
  for (const o of offsets) {
    expect(o.dx, `${o.claim} [${o.span}] left edge`).toBeLessThanOrEqual(1);
    expect(o.dw, `${o.claim} [${o.span}] right edge`).toBeLessThanOrEqual(1);
    expect(o.dy, `${o.claim} [${o.span}] top edge`).toBeLessThanOrEqual(1);
  }
});

test('the tray holds one card per pinned source, and the counts agree', async ({ page }, info) => {
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const wide = (info.project.use.viewport?.width ?? 0) >= 1280;
  if (!wide) await page.getByRole('button', { name: /^Evidence/ }).click();
  const tray = wide ? page.getByRole('complementary', { name: 'Evidence' }) : page.getByRole('dialog', { name: 'Evidence' });
  await expect(tray.locator('li[data-evidence]')).toHaveCount(evidenceCount);
  await expect(tray.getByText(evidenceCount === 1 ? '1 source' : `${evidenceCount} sources`, { exact: true })).toBeVisible();
  // Every quote on a card is the pinned text, verbatim.
  for (const e of events) {
    if (e.type !== 'evidence.found') continue;
    await expect(tray.locator(`li[data-evidence="${e.data.evidence.evidence_id}"] blockquote`)).toContainText(
      e.data.evidence.quote.slice(0, 60),
    );
  }
});

test('the finished case has landmarks, a status line and no axe violations', async ({ page }) => {
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: /Checked/ })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('mobile: the lane strip opens every lane; a part opens its sources', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) >= 768, 'the lane strip is the <768px layout');
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const strip = page.getByRole('complementary', { name: 'Agents' });
  await expect(strip).toContainText('agents · done');
  await strip.getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: 'The desk' });
  await expect(sheet.locator('li[data-agent]')).toHaveCount(Object.keys(finalLaneStates(events)).length);
  await sheet.getByRole('button', { name: 'Close' }).click();

  const withSources = page.locator('li[data-claim]').getByRole('button', { name: /source/ }).first();
  await withSources.click();
  await expect(page.getByRole('dialog', { name: 'Evidence' }).getByText(/Showing the sources for part/)).toBeVisible();
});

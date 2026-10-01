import { expect, test } from '@playwright/test';
import { healthOk } from './case-fixtures';

// P5: the Assay instruments on the three P5 test logs (built from the reference SAMPLES, named
// synthetic-*, so the case bar says "test log, not a real check"). Each renders the state 11 §3 says.

test.describe.configure({ timeout: 90_000 });

const done = '[data-run-status="completed"]';
const at = (name: string, tab = '') => `/case/fixture-synthetic-${name}?speed=50${tab ? `&tab=${tab}` : ''}`;

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

test('a quiet falsehood: the Judge says False, the formula says Mostly true, and the report says why', async ({ page }) => {
  await page.goto(at('quiet-falsehood'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });

  // The stamp is the headline; the Two-Key and the masking notice sit with it on the Report tab.
  await expect(page.locator('article > header [data-slot="stamp"]')).toHaveAttribute('data-label', 'contradicted');
  await expect(page.locator('[data-two-key="split"]')).toContainText('Split decision: Judge False · Formula Mostly true. See the ledger.');
  const notice = page.locator('[data-masking]').first();
  await expect(notice).toContainText("The wording is calm and balanced, but the facts didn't hold up.");
  await expect(notice).toContainText('The overall score (0.72) is lifted by tone, not evidence.');
  await expect(notice).toContainText('Quiet Falsehood Index');
  await expect(notice).toContainText('experimental');
  await expect(page.locator('[data-tipping-sentence]')).toContainText(/Fragile: if the framing of the wording were raised from 0\.08 to 0\.15/);
  await expect(page.locator('[data-hallmark]').first().getByRole('img')).toHaveCount(5);
  await expect(page.locator('[data-stands]').first()).toContainText("The stamp is the Judge's verdict.");
  await expect(page.locator('[data-hallmark-legend]')).toContainText('Bias Impact Score (lower is better)');
  // Truth-first: the composite is never a heading.
  for (const h of await page.locator('h1, h2, h3').allInnerTexts()) expect(h).not.toMatch(/\d\.\d\d/);
});

test('the Assay tab: five scores in full, the ledger balances, the tipping line says fragile', async ({ page }) => {
  await page.goto(at('quiet-falsehood', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const tab = page.getByRole('tabpanel');

  await expect(tab.getByText('Formula version achp-metrics/1.0')).toBeVisible();
  for (const full of [
    'Consensus Truth Score (CTS)',
    'Perspective Completeness Score (PCS)',
    'Bias Impact Score (BIS, lower is better)',
    'Narrative Stance Score (NSS)',
    'Epistemic Position Score (EPS)',
  ]) {
    await expect(tab.locator('[data-legend]')).toContainText(full);
  }
  await expect(tab).toContainText('agreement, not accuracy or confidence');

  const ledger = tab.locator('[data-ledger]');
  await expect(ledger).toContainText('Opening balance');
  await expect(ledger.locator('[data-closing]')).toHaveText('0.720');
  // Facts first, and the books balance: the opening balance plus every printed line is the closing balance.
  await expect(ledger.locator('tbody th[scope="rowgroup"]').first()).toHaveText('Facts');
  const opening = Number((await ledger.locator('tbody tr').first().locator('td').first().innerText()).match(/\d\.\d{3}/)![0]);
  let sum = 0;
  for (const cell of await ledger.locator('tr[data-signal] td:nth-child(3), tr[data-signal] td:nth-child(4)').allInnerTexts()) {
    const n = cell.match(/[+-]\d\.\d{3}/)?.[0];
    if (n) sum += Number(n);
  }
  expect(Math.abs(opening + sum - 0.72)).toBeLessThan(0.008);

  await expect(tab.locator('[data-tipping="fragile"]')).toBeVisible();
});

test('the Hallmark tooltip names the score in full, can be hovered and is dismissed with Escape', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'hover and keyboard focus are the desktop path');
  await page.goto(at('quiet-falsehood'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const bis = page.getByRole('img', { name: /^Bias Impact Score \(BIS\)/ }).first();
  await bis.focus();
  const tip = bis.locator('span[aria-hidden="true"]').last();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('lower is better');
  await tip.hover(); // hoverable: moving onto the tooltip keeps it open
  await expect(tip).toBeVisible();
  await bis.focus();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('Judge and formula agree: the keys both turn and there is no caveat line', async ({ page }) => {
  await page.goto(at('loud-falsehood'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const two = page.locator('[data-two-key="agree"]').first();
  await expect(two).toContainText('Judge and formula agree');
  await expect(two.locator('[data-key="formula"]')).toHaveAttribute('data-turn', '90');
  await expect(page.locator('[data-stands]')).toHaveCount(0);
  await expect(page.locator('[data-masking]')).toHaveCount(0);
});

test('true but loaded: a split the other way, with no masking notice', async ({ page }) => {
  await page.goto(at('true-but-loaded', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-two-key="split"]').first()).toContainText('Judge Mostly true · Formula Mostly false');
  await expect(page.locator('[data-masking]')).toHaveCount(0);
});

test('paper Fig. 9: a close call on the published figures, with no ledger to show', async ({ page }) => {
  await page.goto(at('paper-fig9-metrics', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-two-key="adjacent"]').first()).toContainText('Close call: Judge Mostly false · Formula Mixed (0.53)');
  await expect(page.locator('[data-ledger]')).toHaveCount(0);
  await expect(page.locator('[data-assay-note]')).toContainText('no ledger and no tipping point');
});

test('the Bench is what-if: move a signal, the formula recomputes, Reset restores, nothing to share', async ({ page }) => {
  await page.goto(at('quiet-falsehood', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Try the formula' }).click();
  const bench = page.getByRole('dialog', { name: 'Assay Bench' });
  await expect(bench.locator('[data-whatif]')).toHaveText("What-if. This doesn't re-run the agents.");
  const composite = bench.locator('[data-bench-composite]');
  await expect(composite).toHaveText('0.72');

  const t0 = Date.now();
  await bench.locator('#bench-fA').fill('0.95');
  await bench.locator('#bench-jCTS').fill('0.95');
  await expect(composite).not.toHaveText('0.72');
  expect(Date.now() - t0).toBeLessThan(4000); // a generous ceiling for a loaded test box; the unit test pins 50ms-class work
  await expect(bench.getByRole('button', { name: /copy|share|stamp/i })).toHaveCount(0);

  await bench.getByRole('button', { name: 'Reset to the case' }).click();
  await expect(composite).toHaveText('0.72');
  // The report behind the drawer is unchanged.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tabpanel').locator('[data-ledger] [data-closing]')).toHaveText('0.720');
});

test('the lineage and agreement drawers open, switch formulas and return focus', async ({ page }) => {
  await page.goto(at('quiet-falsehood', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const opener = page.getByRole('button', { name: 'Where the numbers come from' });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: 'Signal lineage' });
  // This log's Judge gave no stance score, so the code reuses the framing score a fifth time (the paper: 3).
  await expect(drawer.locator('tr[data-signal-row="s_fr"] td').last()).toHaveText('5');
  await drawer.getByRole('button', { name: 'Paper formulas' }).click();
  await expect(drawer.locator('tr[data-signal-row="s_fr"] td').last()).toHaveText('3');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();

  await page.getByRole('button', { name: 'How much humans agreed' }).click();
  const dial = page.getByRole('dialog', { name: 'Agreement with people' });
  await expect(dial).toContainText('Agreement with 200 human-annotated claims (Pearson r).');
  await expect(dial).toContainText('humans agreed least with it');
});

test('under 768px the Hallmark stays one row and the tipping scale is a list of zones', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) >= 768, 'the phone layout');
  await page.goto(at('quiet-falsehood', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const ys = await page.getByRole('tabpanel').locator('[data-hallmark] [role="img"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1);
  const zones = page.getByRole('tabpanel').getByRole('list', { name: 'Where the overall score sits on the verdict scale' });
  await expect(zones).toBeVisible();
  await expect(zones.locator('li[aria-current="true"]')).toContainText('Mostly true');
  await expect(page.getByRole('tabpanel').locator('[data-edge]')).toContainText('The overall score is 0.72; the nearest edge is 0.70.');
  // The ledger drops the margin bars and keeps signed amounts.
  await expect(page.getByRole('tabpanel').locator('[data-ledger] tr[data-signal]').first()).toContainText(/[+-]0\.\d{3}/);
});

test('the Assay tab has no axe violations, on any of the three logs', async ({ page }) => {
  test.setTimeout(180_000); // eight full replays, each waiting for the page to be still
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const name of ['quiet-falsehood', 'true-but-loaded', 'paper-fig9-metrics', 'loud-falsehood']) {
    for (const tab of ['', 'assay']) {
      await page.goto(at(name, tab));
      await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((v) => `${name}/${tab || 'report'} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  }
});

test('the Bench, lineage and agreement drawers have no axe violations (open, and with the Bench moved)', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.goto(at('quiet-falsehood', 'assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const scan = async (label: string) => {
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  };
  for (const [opener, label] of [
    ['Where the numbers come from', 'lineage'],
    ['How much humans agreed', 'agreement'],
    ['Try the formula', 'bench'],
  ] as const) {
    await page.getByRole('button', { name: opener }).click();
    await page.getByRole('dialog').waitFor();
    if (label === 'lineage') {
      await scan('lineage production');
      await page.getByRole('button', { name: 'Paper formulas' }).click();
      await scan('lineage paper');
    } else if (label === 'bench') {
      await scan('bench');
      await page.locator('#bench-fA').fill('0.95');
      await page.locator('#bench-s_fr').fill('0.6');
      await scan('bench moved');
    } else {
      await scan(label);
    }
    await page.keyboard.press('Escape');
  }
});

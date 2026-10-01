import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { mockBackend } from './site-mocks';

// How ACHP decides (07 §8, S8.4, IF-12): the five scores with their full forms before any acronym, the Bench labelled
// as a what-if wherever it is read, one headline benchmark number generated from the data file, and the limits.

test.describe.configure({ timeout: 60_000 });

const FULL = {
  CTS: 'Consensus Truth Score',
  PCS: 'Perspective Completeness Score',
  BIS: 'Bias Impact Score',
  NSS: 'Narrative Stance Score',
  EPS: 'Epistemic Position Score',
} as const;

test('every score is spelled out before its acronym appears', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  const text = await page.locator('main').innerText();
  for (const [acronym, full] of Object.entries(FULL)) {
    const fullAt = text.indexOf(full);
    const acronymAt = text.search(new RegExp(`\\b${acronym}\\b`));
    expect(fullAt, `${full} appears`).toBeGreaterThanOrEqual(0);
    expect(acronymAt, `${acronym} appears`).toBeGreaterThanOrEqual(0);
    expect(fullAt, `${full} comes before ${acronym}`).toBeLessThan(acronymAt);
  }
});

test('the story has its eight parts in order, each reachable from the contents', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  const titles = ['The seven agents', 'The five scores', 'Where the numbers come from', 'How much people agreed', 'Try the formula', 'What we found in our own formulas', 'How well it works', 'What it cannot do'];
  const headings = await page.locator('main section[data-step] > div:first-child h2').allTextContents();
  expect(headings).toEqual(titles);
  const nav = page.getByRole('navigation', { name: 'On this page' });
  for (const t of titles) await expect(nav.getByRole('link', { name: t })).toBeVisible();
  await nav.getByRole('link', { name: 'Try the formula' }).click();
  await expect(page).toHaveURL(/#bench$/);
});

test('the agents come from a recorded check, with the challengers shown in parallel', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  await expect(page.locator('[data-agent-card]')).toHaveCount(7);
  await expect(page.getByRole('list', { name: 'These agents work at the same time' }).locator('[data-agent-card]')).toHaveCount(3);
  await expect(page.locator('[data-agent-card="judge"]')).toContainText('Judge');
});

test('the Bench keeps its what-if label wherever it is read, and a sample can be reset', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method#bench');
  await page.getByLabel('Quiet falsehood').check();
  await expect(page.locator('[data-sample-shows]')).toContainText('The Judge says False');
  const whatIf = page.locator('[data-whatif]');
  await expect(whatIf).toContainText("What-if. This doesn't re-run the agents.");
  // Move a signal: the label is still there, and the formula's reading is announced.
  const slider = page.locator('#bench-fA');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(whatIf).toBeVisible();
  await expect(page.locator('[data-bench-composite]')).not.toHaveText('');
  await page.getByRole('button', { name: 'Reset to the sample' }).click();
  await expect(slider).toHaveValue('0.08');
  // Nothing on the Bench can be copied, shared or stamped.
  await expect(page.locator('[data-bench]').getByRole('button', { name: /copy|share|download/i })).toHaveCount(0);
});

test('the findings are computed by the Assay, not typed', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  const masking = page.locator('[data-finding="masking"]');
  await expect(masking).toContainText('Consensus Truth Score is 0.29');
  await expect(masking).toContainText('overall score is 0.72');
  await expect(masking).toContainText('Mostly true');
  await expect(masking).toContainText('The Judge says False');
  await expect(page.locator('[data-finding="leverage"]')).toContainText(/about 3\.\d times/);
});

test('one headline benchmark number, generated from the data file, with the split and the unreconciled figures named', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  const data = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'lib', 'benchmark.generated.json'), 'utf8')) as {
    headline: { value: number; metric: string };
    systems: { name: string }[];
    other_published: { label: string }[];
  };
  await page.goto('/method#benchmark');
  const headline = page.locator('[data-headline]');
  await expect(headline).toHaveText(`${data.headline.value.toFixed(1)}% ${data.headline.metric}`);
  // Exactly one headline.
  await expect(page.locator('[data-headline]')).toHaveCount(1);
  await expect(page.locator('[data-benchmark-table] tbody tr')).toHaveCount(data.systems.length);
  for (const o of data.other_published) await expect(page.locator('main')).toContainText(o.label);
  await expect(page.locator('main')).toContainText('have not been re-run');
  // EVALUATION.md, the data file and the page agree.
  const md = readFileSync(path.resolve(__dirname, '..', '..', '..', 'EVALUATION.md'), 'utf8');
  expect(md).toContain(`${data.headline.value.toFixed(1)}% ${data.headline.metric}`);
});

test('no radar, no composite headline and no marketing words', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  await expect(page.locator('main [role="img"][aria-label*="radar" i]')).toHaveCount(0);
  const text = (await page.locator('main').innerText()).toLowerCase();
  for (const w of ['revolutionary', 'ai-powered', 'cutting-edge', 'game-changing']) expect(text).not.toContain(w);
  for (const h of await page.locator('main h1, main h2').allTextContents()) expect(h).not.toMatch(/overall score/i);
});

test('the scroll reveal only exists where scroll-driven animations do, so nothing waits to be revealed elsewhere', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/method');
  // The reveal's animation lives inside an @supports (animation-timeline: view()) block: a browser without it (stock
  // Firefox) never applies it, and every step is simply on the page.
  const rules = await page.evaluate(() => {
    const out: { selector: string; inSupports: boolean }[] = [];
    const walk = (list: CSSRuleList, inSupports: boolean) => {
      for (const r of Array.from(list)) {
        if (r instanceof CSSSupportsRule) walk(r.cssRules, inSupports || r.conditionText.includes('animation-timeline'));
        else if (r instanceof CSSMediaRule) walk(r.cssRules, inSupports);
        else if (r instanceof CSSStyleRule && r.selectorText.includes('.story-step .reveal') && r.style.animationName && r.style.animationName !== 'none') out.push({ selector: r.selectorText, inSupports });
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, false);
      } catch {
        // a cross-origin sheet: not ours
      }
    }
    return out;
  });
  expect(rules.length).toBeGreaterThan(0);
  expect(rules.filter((r) => !r.inSupports)).toEqual([]);
});

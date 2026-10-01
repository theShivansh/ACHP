import { expect, test, type Page } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';
import { initialRunState, reduceRun } from '../lib/runs/reducer';
import { mockBackend } from './site-mocks';

// P7: the quiet, silent micro-interactions (05 §4). Each one has a job, ends, and is still under reduced motion.

// One retry: the view-transition test occasionally starts no transition when the dev server is busy compiling the case route.
test.describe.configure({ timeout: 90_000, retries: 1 });

const done = '[data-run-status="completed"]';
const { name, events } = pickFixture('exercise-mixed', 'synthetic-mixed');
const mixed = `/case/fixture-${name}?speed=20`;
const quiet = (tab = '') => `/case/fixture-synthetic-quiet-falsehood?speed=50${tab ? `&tab=${tab}` : ''}`;

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

type Info = { project: { name: string } };
const reduced = (info: Info) => info.project.name.includes('reduced');
const phone = (info: Info) => info.project.name.includes('mobile');

/** Every CSS animation and transition the page starts, by name, while the test acts. */
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __anim: string[] };
    w.__anim = [];
    document.addEventListener(
      'animationstart',
      (e) => {
        const cs = getComputedStyle(e.target as Element);
        w.__anim.push((e as AnimationEvent).animationName);
        w.__anim.push(`timing:${(e as AnimationEvent).animationName}:${cs.animationDuration}:${cs.animationIterationCount}`);
      },
      true,
    );
    document.addEventListener('transitionrun', (e) => w.__anim.push(`transition:${(e as TransitionEvent).propertyName}`), true);
  });
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { __anim: string[] }).__anim);

test('copy morphs to a check, reads "Copied", is announced, then reverts after 1.6s', async ({ page, context }, info) => {
  test.skip(info.project.name.startsWith('mobile-light'), 'clipboard permissions are set up for the Chromium projects');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(mixed);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const bar = page.locator('[data-share-bar]');
  // The button's name changes to "Copied", so it is found by its attribute, not by its name.
  const button = bar.locator('button[data-confirm]').first();
  const status = bar.getByRole('status').first();
  await expect(button).toHaveAttribute('data-confirm', 'idle');
  await button.click();
  await expect(button).toHaveAttribute('data-confirm', 'done');
  // The accessible name is the visible word, and one sentence is spoken.
  await expect(bar.getByRole('button', { name: 'Copied' }).first()).toBeVisible();
  await expect(status).toHaveText('Summary copied.');
  // The icon swapped in place: the check is shown, the clipboard hidden.
  const icons = button.locator('svg');
  await expect(icons.nth(1)).toHaveCSS('opacity', '1');
  await expect(icons.nth(0)).toHaveCSS('opacity', '0');
  // No toast on top of it.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await expect(button).toHaveAttribute('data-confirm', 'idle', { timeout: 4000 });
  await expect(status).toHaveText('');
});

test('a hover waits before a definition appears, focus shows it at once, and it leaves at once', async ({ page }, info) => {
  test.skip(phone(info), 'hover is the desktop path');
  await page.goto(quiet());
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const mark = page.locator('[data-hallmark] [data-metric="BIS"]').first();
  const tip = mark.locator('span[aria-hidden="true"]').last();
  const shown = () => tip.evaluate((el) => getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0);

  // How long after the pointer arrives does the definition first show? Timed in the page, so a busy test runner can't skew it.
  const wait = mark.evaluate(
    (el) =>
      new Promise<number>((resolve) => {
        const box = el.querySelector('span[aria-hidden="true"]:last-child') as HTMLElement;
        el.addEventListener(
          'pointerenter',
          () => {
            const t0 = performance.now();
            const tick = () => {
              const c = getComputedStyle(box);
              if (c.visibility === 'visible' && Number(c.opacity) > 0) resolve(performance.now() - t0);
              else requestAnimationFrame(tick);
            };
            tick();
          },
          { once: true },
        );
      }),
  );
  await mark.hover();
  const waited = await wait;
  expect(waited).toBeGreaterThanOrEqual(380);
  expect(waited).toBeLessThan(1500);
  await page.mouse.move(2, 2);
  expect(await shown()).toBe(false); // instant exit: checked in the very next call

  await mark.focus();
  expect(await shown()).toBe(true); // keyboard focus: no wait
});

test('the tab indicator slides under the active tab, and follows the arrow keys', async ({ page }, info) => {
  await recordAnimations(page);
  await page.goto(mixed);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const list = page.getByRole('tablist', { name: 'Case sections' });
  const rule = list.locator('[data-slot="tabs-indicator"]');
  await expect(rule).toHaveCount(1);
  const under = async (tab: string) => {
    const t = await list.getByRole('tab', { name: new RegExp(`^${tab}`) }).boundingBox();
    const r = await rule.boundingBox();
    return Math.abs(r!.x - t!.x) < 1.5 && Math.abs(r!.width - t!.width) < 1.5;
  };
  await expect.poll(() => under('Report')).toBe(true);

  await list.getByRole('tab', { name: /^Report/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(list.getByRole('tab', { name: /^Evidence/ })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => under('Evidence')).toBe(true);
  // It moved (a transition on the rule's transform), or under reduced motion it jumped.
  const moves = (await seen(page)).filter((n) => n === 'transition:translate' || n === 'transition:scale');
  if (reduced(info)) expect(moves).toEqual([]);
  else expect(moves.length).toBeGreaterThan(0);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => under('Report')).toBe(true);
  await expect(list.getByRole('tab', { name: /^Report/ })).toHaveAttribute('aria-selected', 'true');
});

test('hovering a source rules the exact words it bears on; the others dim to 60%; both leave at once', async ({ page }, info) => {
  test.skip(phone(info), 'hover and the side tray are the desktop path');
  const state = events.reduce(reduceRun, initialRunState());
  const mark = Object.values(state.claims)
    .flatMap((c) => c.marks.map((m) => ({ claim: c.claim_id, seq: m.seq, evidence: m.evidence_ids?.[0] })))
    .find((m) => m.evidence);
  test.skip(!mark, 'the log has no mark that cites a source');
  await page.goto(mixed);
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

  const rule = page.locator(`[data-link-rule="${mark!.seq}"]`).first();
  const card = page.locator(`aside li[data-evidence="${mark!.evidence}"]`);
  const scale = () => rule.evaluate((el) => new DOMMatrix(getComputedStyle(el, '::after').transform).a);
  expect(await scale()).toBe(0);

  await card.hover();
  await expect.poll(scale, { timeout: 2000 }).toBe(1);
  await expect(rule).toHaveAttribute('data-lit', 'true');
  const other = page.locator(`aside li[data-evidence]:not([data-evidence="${mark!.evidence}"])`).first();
  const hasOther = (await other.count()) > 0;
  if (hasOther) await expect(other).toHaveCSS('opacity', '0.6');

  await page.mouse.move(2, 2);
  expect(await scale()).toBe(0); // out at once
  if (hasOther) expect(await other.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

  // The focus twin.
  await card.focus();
  await expect(rule).toHaveAttribute('data-lit', 'true');
  await card.blur();
  await expect(rule).not.toHaveAttribute('data-lit', 'true');
});

test('hovering or focusing a Hallmark mark rules the Ledger rows that fed it, and a row lights its marks', async ({ page }, info) => {
  test.skip(phone(info), 'hover is the desktop path');
  await page.goto(quiet('assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const lit = (signal: string) => page.locator(`tr[data-signal="${signal}"] [data-link-rule]`);
  const bis = page.locator('[data-hallmark] [data-metric="BIS"]').first();

  await expect(lit('s_nil')).not.toHaveAttribute('data-lit', 'true');
  await bis.hover();
  await expect(lit('s_nil')).toHaveAttribute('data-lit', 'true'); // wording feeds BIS
  await expect(lit('fA')).not.toHaveAttribute('data-lit', 'true'); // the facts do not
  await page.mouse.move(2, 2);
  await expect(lit('s_nil')).not.toHaveAttribute('data-lit', 'true');
  await bis.focus();
  await expect(lit('s_nil')).toHaveAttribute('data-lit', 'true');
  await bis.blur();

  // The other way: a row lights the marks it fed, and its bar gains a 1px ink outline.
  const row = page.locator('tr[data-signal="fA"]');
  await row.focus();
  await expect(page.locator('[data-hallmark] [data-link-rule="CTS"]').first()).toHaveAttribute('data-lit', 'true');
  await expect(page.locator('[data-hallmark] [data-link-rule="BIS"]').first()).not.toHaveAttribute('data-lit', 'true');
  await expect(row.locator('td').last().locator('span > span:last-child')).toHaveCSS('outline-style', 'solid');
});

test('the Tipping dot slides in and the leader draws out, then everything is still', async ({ page }, info) => {
  test.skip(phone(info) && !reduced(info), 'the drawing is shown from 768px');
  await recordAnimations(page);
  await page.goto(quiet('assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  if (reduced(info)) {
    expect(await seen(page)).not.toContain('tip-dot-in');
  } else {
    // The leader waits --dur-base for the dot, and an event batch paints as a transition (a frame or two later).
    await expect.poll(() => seen(page)).toContain('tip-dot-in');
    await expect.poll(() => seen(page)).toContain('tip-leader-in');
  }
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 });
});

test("the Two-Key's second key turns in two stepped frames when the Bench changes the formula's reading", async ({ page }, info) => {
  test.skip(phone(info) && !reduced(info), 'the Bench is the desktop path');
  await page.goto(quiet('assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Try the formula' }).click();
  const bench = page.getByRole('dialog', { name: 'Assay Bench' });
  const key = bench.locator('[data-key="formula"] [data-key-glyph]');
  const turn = () => key.evaluate((el) => getComputedStyle(el).getPropertyValue('--turn').trim());
  const before = await turn();
  for (const [id, v] of [['fA', '0.02'], ['jCTS', '0.02'], ['s_nil', '1'], ['s_fr', '1']]) await bench.locator(`#bench-${id}`).fill(v);
  await expect.poll(turn).not.toBe(before);
  // The verdicts are in words too, so the glyph is never the only carrier.
  await expect(bench.locator('[data-two-key]')).toContainText(/Judge .* Formula/);
  if (!reduced(info)) {
    const t = await key.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fn: cs.transitionTimingFunction, dur: cs.transitionDuration };
    });
    expect(t.fn).toContain('steps(2');
    expect(t.dur).toBe('0.166s');
  }
});

test('a changed count rolls its digits in, and everything is still afterwards', async ({ page }, info) => {
  await recordAnimations(page);
  await page.goto(`/case/fixture-${name}?speed=4`);
  await expect(page.locator(done)).toBeVisible({ timeout: 80_000 });
  const names = await seen(page);
  if (reduced(info)) expect(names).not.toContain('roll-in');
  else expect(names).toContain('roll-in');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
});

test('a too-short claim shakes the field three times by 4px, says what is missing and sends nothing', async ({ page }, info) => {
  await recordAnimations(page);
  await mockBackend(page, { libraries: [], runId: 'sample-exercise-mixed' });
  await page.goto('/');
  const field = page.locator('[data-claim-input] > div').first();
  await page.getByRole('textbox').fill('too short');
  await page.getByRole('button', { name: 'Check this claim' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('at least 12 characters');
  await expect(page.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  expect(new URL(page.url()).pathname).toBe('/');
  if (reduced(info)) {
    expect(await field.evaluate((el) => el.getAnimations().length)).toBe(0);
    return;
  }
  // Three iterations of 80ms: 240ms, 4px each way.
  expect(await seen(page)).toContain('timing:shake:0.08s:3');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
});

test("submitting a claim morphs it into the case's headline (a to-case view transition); not when reduced", async ({ page }, info) => {
  test.skip(phone(info) && !reduced(info), 'the morph is checked on desktop and under reduced motion');
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: { types: string[] | null }[]; __groups: string[] };
    w.__vt = [];
    w.__groups = [];
    const orig = document.startViewTransition?.bind(document);
    if (!orig) return;
    document.startViewTransition = (arg?: unknown) => {
      const types = (arg as { types?: Iterable<string> } | undefined)?.types;
      w.__vt.push({ types: types ? [...types] : null });
      return orig(arg as never);
    };
    setInterval(() => {
      for (const a of document.getAnimations()) {
        const pe = (a.effect as KeyframeEffect | null)?.pseudoElement;
        if (pe?.includes('claim-text')) w.__groups.push(`${pe} ${a.effect!.getTiming().duration}`);
      }
    }, 16);
  });
  await mockBackend(page, { libraries: [], runId: 'sample-exercise-mixed' });
  await page.goto('/');
  await page.getByRole('textbox').fill('Regular exercise reduces heart disease risk by 30 to 40 percent.');
  await page.getByRole('button', { name: 'Check this claim' }).click();
  await page.waitForURL(/\/case\/sample-exercise-mixed/, { timeout: 30_000 });
  await expect(page.locator('h1').first()).toBeVisible();
  const { vt, groups } = await page.evaluate(() => {
    const w = window as unknown as { __vt: { types: string[] | null }[]; __groups: string[] };
    return { vt: w.__vt, groups: w.__groups };
  });
  if (reduced(info)) {
    expect(groups).toEqual([]);
  } else {
    expect(vt.some((v) => v.types?.includes('to-case'))).toBe(true);
    // The shared claim animates for --dur-deliberate (360ms).
    expect(groups.some((g) => g.includes('::view-transition-group(claim-text)') && g.endsWith(' 360'))).toBe(true);
  }
});

test('the ledger is one tab stop and the arrow keys move between its lines; Escape closes a hovered tooltip', async ({ page }, info) => {
  test.skip(phone(info), 'keyboard and hover are the desktop path');
  await page.goto(quiet('assay'));
  await expect(page.locator(done)).toBeVisible({ timeout: 60_000 });
  const rows = page.locator('[data-ledger] tr[data-signal]');
  expect(await rows.evaluateAll((r) => r.filter((x) => (x as HTMLElement).tabIndex === 0).length)).toBe(1);
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  expect(await rows.evaluateAll((r) => r.filter((x) => (x as HTMLElement).tabIndex === 0).length)).toBe(1);
  await expect(rows.nth(1).locator('th')).toContainText(/, feeds /);

  // Hover alone (no focus) shows the tooltip after its wait; Escape from anywhere dismisses it (WCAG 1.4.13).
  const mark = page.locator('[data-hallmark] [data-metric="BIS"]').first();
  const tip = mark.locator('span[aria-hidden="true"]').last();
  await mark.hover();
  await expect.poll(() => tip.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  await page.keyboard.press('Escape');
  await expect.poll(() => tip.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
});

test('the claim field shows a focus ring, and the message sits under it', async ({ page }) => {
  await mockBackend(page, { libraries: [], runId: 'sample-exercise-mixed' });
  await page.goto('/');
  await page.getByRole('textbox').focus();
  const ring = await page.locator('[data-claim-input] > div').first().evaluate((el) => {
    const c = getComputedStyle(el);
    return { w: c.outlineWidth, style: c.outlineStyle };
  });
  expect(ring).toEqual({ w: '2px', style: 'solid' });
  await page.getByRole('textbox').fill('short');
  await page.keyboard.press('Control+Enter');
  const alert = page.locator('p[role="alert"]');
  await expect(alert).toContainText('at least 12 characters');
  const [a, f] = await Promise.all([alert.boundingBox(), page.locator('[data-claim-input] > div').first().boundingBox()]);
  expect(a!.y).toBeGreaterThanOrEqual(f!.y + f!.height - 1); // directly below the field
});

import { expect, test, type Page } from '@playwright/test';
import { healthOk, pickFixture } from './case-fixtures';
import { buildChapters, CHAPTER_IDS, gateCount } from '../lib/runs/chapters';

// P6: any finished case as a scroll story (05 §2). The friction is a longer scroll TRACK with a pinned stage;
// the wheel is never touched. Engines: Playwright's Chromium (native scroll-driven CSS), a forced fallback in
// the same Chromium (what stock Firefox runs: Motion's useScroll), and a reduced-motion run (a static document).
// WebKit and Firefox are not installed in this project; the fallback is exercised by making CSS.supports say
// "no" for animation-timeline before the page loads.

test.describe.configure({ timeout: 90_000 });

const url = (name: string) => `/case/fixture-${name}?replay=1`;
const FIXTURES = ['exercise-mixed', 'all-supported', 'contradicted-strong', 'missing-context', 'unverifiable', 'blocked'];

test.beforeEach(async ({ page }) => {
  await healthOk(page);
});

/** Top of the first gate track, in page coordinates, and how many pixels of scroll its `contain` range spans. */
async function gateBox(page: Page) {
  return page.locator('.story-friction').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + scrollY), height: Math.round(r.height), vh: innerHeight };
  });
}
const scrollToY = (page: Page, y: number) => page.evaluate((v) => window.scrollTo(0, v), y);
const opacityOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).opacity));

test('the stage is pinned inside the gate and the gate track is 220vh', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the phone run is reduced-motion (a static document)');
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('.story-friction').first()).toBeAttached();
  const g = await gateBox(page);
  expect(g.height).toBe(Math.round(g.vh * 2.2));

  const stageTops: number[] = [];
  for (const dy of [150, 450, 750]) {
    await scrollToY(page, g.top + dy);
    stageTops.push(await page.locator('.story-friction .stage').first().evaluate((el) => Math.round(el.getBoundingClientRect().top)));
  }
  // Sticky: the stage holds one position on screen while the track scrolls past.
  expect(new Set(stageTops).size).toBe(1);
  expect(await page.locator('.story-friction .stage').first().evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
});

test('the gate’s lines reveal with the scroll (native scroll-driven animation): opacity only ever rises', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the phone run is reduced-motion');
  await page.goto(url('contradicted-strong'));
  expect(await page.evaluate(() => CSS.supports('animation-timeline: view()'))).toBe(true);
  const g = await gateBox(page);
  const line3 = '.story-friction .line:nth-of-type(3)';
  if ((await page.locator(line3).count()) === 0) test.skip(true, 'this gate has two lines');
  const samples: number[] = [];
  for (const dy of [40, 500, 700, 950]) {
    await scrollToY(page, g.top + dy);
    await page.waitForTimeout(80);
    samples.push(await opacityOf(page, line3));
  }
  for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  expect(samples[0]).toBeLessThan(0.3);
  expect(samples.at(-1)).toBeGreaterThan(0.9);
  // The first line is fully there once the reader is a little way in.
  await scrollToY(page, g.top + 400);
  expect(await opacityOf(page, '.story-friction .line:nth-of-type(1)')).toBeGreaterThan(0.95);
});

test('without scroll-driven animations (stock Firefox) the same lines are driven by Motion', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the phone run is reduced-motion');
  await page.addInitScript(() => {
    const real = CSS.supports.bind(CSS);
    CSS.supports = ((q: string, v?: string) => (String(q).includes('animation-timeline') ? false : v === undefined ? real(q) : real(q, v))) as typeof CSS.supports;
  });
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('[data-gate-line]').first()).toBeAttached();
  await expect(page.locator('.story-friction .line')).toHaveCount(0); // the native reveal is not also running
  const g = await gateBox(page);
  const last = page.locator('.story-friction').first().locator('[data-gate-line]').last();
  const n = await page.locator('.story-friction').first().locator('[data-gate-line]').count();
  const opacity = () => last.evaluate((el) => Number(getComputedStyle(el).opacity));
  // Motion updates on the next animation frame, so each position is polled until the value settles.
  await scrollToY(page, g.top + 20);
  await expect.poll(opacity, { timeout: 5000 }).toBeLessThan(0.3);
  await scrollToY(page, g.top + 700);
  await expect.poll(opacity, { timeout: 5000 }).toBeGreaterThan(0.3);
  const mid = await opacity();
  await scrollToY(page, g.top + 950);
  await expect.poll(opacity, { timeout: 5000 }).toBeGreaterThan(0.9);
  expect(mid).toBeLessThan(1);
  expect(n).toBeGreaterThanOrEqual(2);
  // A normal step simply shows its content in the fallback (no reveal).
  expect(await opacityOf(page, '[data-chapter="sources"] .reveal')).toBe(1);
});

test('reduced motion: a static document, nothing pinned, nothing hidden, marks drawn', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('.story-friction').first()).toBeAttached();
  await expect(page.locator('.story .mark').first()).toBeAttached(); // strips measure their spans after layout
  const info = await page.evaluate(() => {
    const vh = innerHeight;
    const pos = [...document.querySelectorAll('.story-friction .stage')].map((e) => getComputedStyle(e).position);
    const h = [...document.querySelectorAll('.story-friction')].map((e) => e.getBoundingClientRect().height / vh);
    const hidden = [...document.querySelectorAll('.reveal, .line, [data-gate-line]')].filter((e) => Number(getComputedStyle(e).opacity) < 1).length;
    const animated = document.getAnimations().filter((a) => a.playState === 'running').length;
    // Inside the story only: the desk header is sticky on every page.
    const sticky = [...document.querySelectorAll('[data-story] *')].filter((e) => getComputedStyle(e).position === 'sticky').length;
    const marks = [...document.querySelectorAll('.story .mark path')].map((p) => getComputedStyle(p).strokeDashoffset);
    return { pos, h, hidden, animated, sticky, marks };
  });
  expect(info.pos.every((p) => p === 'static')).toBe(true);
  expect(info.h.every((x) => x < 1.6)).toBe(true); // natural height, not 220vh
  expect(info.hidden).toBe(0);
  expect(info.animated).toBe(0);
  expect(info.sticky).toBe(0);
  expect(info.marks.length).toBeGreaterThan(0);
  expect(info.marks.every((m) => m === '0px' || m === '0')).toBe(true);
});

test('"Skip to verdict" and the End key reach the verdict at once; the rail follows', async ({ page }) => {
  await page.goto(url('contradicted-strong'));
  const skip = page.getByRole('link', { name: 'Skip to verdict' });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.locator('#chapter-verdict')).toBeInViewport();
  await expect(page.locator('[data-tick="verdict"]')).toHaveAttribute('aria-current', 'step');

  await page.goto(url('contradicted-strong'));
  await page.locator('body').click({ position: { x: 5, y: 120 } });
  await page.keyboard.press('End');
  await expect(page.locator('#chapter-verdict')).toBeInViewport();
});

test('the rail has seven ticks, links to each chapter, and the current one is marked', async ({ page }) => {
  await page.goto(url('exercise-mixed'));
  const ticks = page.locator('[data-story-rail] [data-tick]');
  await expect(ticks).toHaveCount(7);
  expect(await ticks.evaluateAll((els) => els.map((e) => e.getAttribute('data-tick')))).toEqual([...CHAPTER_IDS]);
  await expect(page.locator('[data-tick="claim"]')).toHaveAttribute('aria-current', 'step');
  await page.locator('[data-tick="sources"]').click();
  await expect(page.locator('#chapter-sources')).toBeInViewport();
  await expect(page.locator('[data-tick="sources"]')).toHaveAttribute('aria-current', 'step');
});

test('nothing in the story intercepts the wheel or touch, snaps the scroll or hides the scrollbar', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __prevented: number; __listeners: number };
    w.__prevented = 0;
    w.__listeners = 0;
    const real = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
      if (['wheel', 'mousewheel', 'touchstart', 'touchmove'].includes(type) && typeof fn === 'function') {
        w.__listeners += 1;
        const wrapped = function (this: unknown, e: Event) {
          const pd = e.preventDefault.bind(e);
          e.preventDefault = () => {
            w.__prevented += 1;
            pd();
          };
          return (fn as EventListener).call(this, e);
        };
        return real.call(this, type, wrapped, opts);
      }
      return real.call(this, type, fn, opts);
    };
  });
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('.story-friction').first()).toBeAttached();
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(40);
  }
  const scrolled = await page.evaluate(() => scrollY);
  expect(scrolled).toBeGreaterThan(1000); // the wheel scrolled natively, and by the full amount
  const r = await page.evaluate(() => {
    const w = window as unknown as { __prevented: number };
    const cs = (el: Element) => getComputedStyle(el);
    return {
      prevented: w.__prevented,
      snapHtml: cs(document.documentElement).scrollSnapType,
      snapBody: cs(document.body).scrollSnapType,
      overflow: [cs(document.documentElement).overflowY, cs(document.body).overflowY],
      scrollbar: [cs(document.documentElement).scrollbarWidth, cs(document.body).scrollbarWidth],
    };
  });
  expect(r.prevented).toBe(0);
  expect(r.snapHtml).toBe('none');
  expect(r.snapBody).toBe('none');
  expect(r.overflow).not.toContain('hidden');
  expect(r.scrollbar).not.toContain('none');
});

for (const name of FIXTURES) {
  test(`replay works for ${name}: seven chapters, gates as the log says, captions from the log`, async ({ page }) => {
    const { events } = pickFixture(name, name);
    const chapters = buildChapters(events);
    await page.goto(url(name));
    await expect(page.locator('section[id^="chapter-"]')).toHaveCount(7);
    await expect(page.locator('.story-friction')).toHaveCount(gateCount(chapters));
    for (const c of chapters) {
      await expect(page.locator(`#chapter-${c.id} h2`)).toHaveText(c.title);
      if (c.id !== 'claim' && c.caption) await expect(page.locator(`#chapter-${c.id} [data-caption]`)).toHaveText(c.caption);
    }
    // The stage content is the real UI: the verdict chapter holds the same stamp as the report.
    await expect(page.locator('#chapter-verdict [data-slot="stamp"]').first()).toBeAttached();
    await page.getByRole('link', { name: 'Skip to verdict' }).click();
    await expect(page.locator('#chapter-verdict')).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Open the full report' })).toHaveAttribute('href', new RegExp(`/case/fixture-${name}`));
  });
}

test('the story has no axe violations (top, inside a gate, and at the verdict)', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('.story-friction').first()).toBeAttached();
  const g = await gateBox(page);
  for (const y of [0, g.top + 500, 99999]) {
    await scrollToY(page, y);
    await page.waitForTimeout(200); // scroll-linked opacity settles on the next frame
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `y=${y} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});

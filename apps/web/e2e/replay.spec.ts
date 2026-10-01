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

test('the gate’s quote and sentence reveal with the scroll (native scroll-driven animation): opacity only ever rises', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the phone run is reduced-motion');
  await page.goto(url('contradicted-strong'));
  expect(await page.evaluate(() => CSS.supports('animation-timeline: view()'))).toBe(true);
  const g = await gateBox(page);
  const second = '.story-friction .line[data-line="2"]';
  await expect(page.locator(second).first()).toBeAttached();
  const samples: number[] = [];
  for (const dy of [40, 300, 420, 700]) {
    await scrollToY(page, g.top + dy);
    await page.waitForTimeout(80);
    samples.push(await opacityOf(page, second));
  }
  for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  expect(samples[0]).toBeLessThan(0.3);
  expect(samples.at(-1)).toBeGreaterThan(0.9);
  // The first line (the quoted counter-evidence) is fully there once the reader is a little way in.
  await scrollToY(page, g.top + 400);
  expect(await opacityOf(page, '.story-friction .line[data-line="1"]')).toBeGreaterThan(0.95);
});

test('a gate is never an empty stage: its heading and struck strip are on screen, drawn, before anything is revealed', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the phone run is reduced-motion');
  await page.goto(url('contradicted-strong'));
  const g = await gateBox(page);
  await scrollToY(page, g.top - 60);
  await page.waitForTimeout(150);
  await expect(page.locator('.story-friction').first().locator('h2')).toBeInViewport();
  const strip = page.locator('.story-friction').first().locator('[data-gate-strip]');
  await expect(strip).toBeInViewport();
  expect(await opacityOf(page, '.story-friction [data-gate-strip]')).toBe(1);
  // The mark draws with the scroll: nearly undrawn at the start of the track, fully drawn past its range.
  const offset = () => page.locator('.story-friction').first().locator('.mark path').first().evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
  await scrollToY(page, g.top + 10);
  await page.waitForTimeout(100);
  expect(await offset()).toBeGreaterThan(0.6);
  await scrollToY(page, g.top + 700);
  await page.waitForTimeout(100);
  expect(await offset()).toBeLessThan(0.05);
});

test('on a phone the track is 180vh, the stage pins, and the rail is a short bar', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'this run is the non-reduced phone layout in a desktop project');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('.story-friction').first()).toBeAttached();
  const g = await gateBox(page);
  expect(g.height).toBe(Math.round(g.vh * 1.8));
  const tops: number[] = [];
  for (const dy of [100, 350, 600]) {
    await scrollToY(page, g.top + dy);
    tops.push(await page.locator('.story-friction .stage').first().evaluate((el) => Math.round(el.getBoundingClientRect().top)));
  }
  expect(new Set(tops).size).toBe(1);
  const rail = await page.locator('[data-story-rail]').boundingBox();
  expect(rail!.height).toBeLessThan(110); // one row of ticks and the skip, not a quarter of the screen
  await expect(page.locator('[data-story-current]')).toContainText(/\d of 7/);
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
  await scrollToY(page, g.top + 400);
  await expect.poll(opacity, { timeout: 5000 }).toBeGreaterThan(0.3);
  const mid = await opacity();
  await scrollToY(page, g.top + 700);
  await expect.poll(opacity, { timeout: 5000 }).toBeGreaterThan(0.9);
  expect(mid).toBeLessThan(1);
  expect(n).toBeGreaterThanOrEqual(1);
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

test('focus inside a gate shows the line it is on, even before the scroll has revealed it (2.4.7)', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'the phone run is reduced-motion');
  await page.goto(url('contradicted-strong'));
  const g = await gateBox(page);
  await scrollToY(page, g.top + 10);
  await page.waitForTimeout(150);
  const line = '.story-friction .line[data-line="1"]';
  expect(await opacityOf(page, line)).toBeLessThan(0.3);
  await page.locator(`${line} [data-evidence]`).first().focus();
  await page.waitForTimeout(100);
  expect(await opacityOf(page, line)).toBe(1);
});

test('at 400% zoom (a 320 × 256 viewport) nothing is pinned, nothing is waiting, and the gate does not overlap what follows', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'this run sets its own viewport');
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('.story-friction').first()).toBeAttached();
  await expect(page.locator('.story .mark').first()).toBeAttached();
  const r = await page.evaluate(() => {
    const gates = [...document.querySelectorAll('.story-friction')];
    const stage = gates[0].querySelector('.stage')!;
    const next = gates[0].nextElementSibling ?? gates[0].parentElement!.nextElementSibling;
    const hidden = [...document.querySelectorAll('.line, .reveal')].filter((e) => Number(getComputedStyle(e).opacity) < 1).length;
    return {
      position: getComputedStyle(stage).position,
      hidden,
      overlap: next ? gates[0].getBoundingClientRect().bottom > next.getBoundingClientRect().top + 1 : false,
      noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
    };
  });
  expect(r.position).toBe('static');
  expect(r.hidden).toBe(0);
  expect(r.overlap).toBe(false);
  expect(r.noHScroll).toBe(true); // reflow: no sideways scroll at 320px
  // The skip link wraps to its own row rather than squeezing the ticks below 24px.
  const ticks = await page.locator('[data-tick]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(Math.min(...ticks)).toBeGreaterThanOrEqual(24);
});

test('the rail puts "Skip to verdict" first in the tab order, and a phone scrolls focused content clear of the bar', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'this run sets its own viewport');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('contradicted-strong'));
  expect(await page.locator('[data-story-rail] a').first().getAttribute('data-skip-verdict')).not.toBeNull();
  const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
  expect(pad).toBeGreaterThanOrEqual(112); // 7rem: taller than the bar
  const bar = await page.locator('[data-story-rail]').boundingBox();
  expect(bar!.height).toBeLessThanOrEqual(pad);
});

test('every id on the story page is unique (the same strip appears in several chapters)', async ({ page }) => {
  await page.goto(url('contradicted-strong'));
  await expect(page.locator('section[id^="chapter-"]')).toHaveCount(7);
  const dupes = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  });
  expect(dupes).toEqual([]);
});

test('"N sources" on a part in the verdict chapter opens the report’s Evidence tab (no dead button)', async ({ page }) => {
  await page.goto(url('exercise-mixed'));
  const btn = page.locator('#chapter-verdict li[data-claim]').getByRole('button', { name: /source/ }).first();
  await btn.scrollIntoViewIfNeeded();
  // A click before hydration is inert, so click until the page has taken it (the button is real once it navigates).
  await expect(async () => {
    await btn.click();
    await expect(page).toHaveURL(/\/case\/fixture-exercise-mixed.*tab=evidence/, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
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
    if (name === 'contradicted-strong') {
      // The part that was wrong is on the verdict chapter, struck by the Judge's own mark.
      await expect(page.locator('#chapter-verdict li[data-claim]').first()).toBeAttached();
      await expect(page.locator('#chapter-verdict svg.mark[data-ruled]').first()).toBeAttached();
    }
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

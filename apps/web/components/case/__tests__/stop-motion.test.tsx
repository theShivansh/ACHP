import { render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { GLYPH_BASE, GLYPH_PATHS } from '@/components/glyphs/paths';
import { LampGlyph, SealGlyph } from '@/components/glyphs';
import { jitterPath, MARK_FRAMES, seededRandom } from '@/lib/handdrawn';
import { ArrivalProvider, usePlayOnce } from '../arrival';
import { Mark, markStroke } from '../Mark';

// P8: the hand in the hand-drawn layer is deterministic, and the handmade moments play only on arrival, once.

const nums = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe('glyphs', () => {
  it('bake a pencil wobble of at most ±0.6px into every point, the same on every load', () => {
    for (const name of Object.keys(GLYPH_BASE) as (keyof typeof GLYPH_BASE)[]) {
      const base = nums(GLYPH_BASE[name]);
      const drawn = nums(GLYPH_PATHS[name]);
      expect(drawn).toHaveLength(base.length);
      expect(drawn.some((n, i) => n !== base[i])).toBe(true);
      drawn.forEach((n, i) => expect(Math.abs(n - base[i])).toBeLessThanOrEqual(0.6 + 1e-9));
      for (const n of drawn) {
        expect(n).toBeGreaterThanOrEqual(-1);
        expect(n).toBeLessThanOrEqual(25);
      }
      expect(jitterPath(GLYPH_BASE[name], `glyph:${name}`)).toBe(GLYPH_PATHS[name]);
    }
  });

  it('are one 1.75px round-capped stroke in currentColor on a 24px grid, hidden unless given a title', () => {
    const svg = render(<SealGlyph />).container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.75');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    const named = render(<LampGlyph title="Waking the desk" />).container.querySelector('svg')!;
    expect(named.getAttribute('role')).toBe('img');
    expect(named.getAttribute('aria-hidden')).toBeNull();
    expect(named.querySelector('title')?.textContent).toBe('Waking the desk');
  });

  it('refuse a relative path (its wobble would accumulate)', () => {
    expect(() => jitterPath('M1 1 l2 2', 'x')).toThrow();
  });
});

describe('marks', () => {
  const rect = { x: 0, y: 0, width: 120, height: 24 };
  it('take the spec frame counts: underline 6, strike 5, bracket 7, swipe 5', () => {
    expect(MARK_FRAMES.underline).toBe(6);
    expect(markStroke('contradicts', false)).toEqual({ stroke: 'underline', draw: 'line' });
    expect(markStroke('contradicts', true)).toEqual({ stroke: 'strike', draw: 'line' });
    expect(markStroke('missing_context', false).stroke).toBe('bracket');
    expect(markStroke('framing', false)).toEqual({ stroke: 'swipe', draw: 'swipe' });
    expect(markStroke('unclear', false).draw).toBe('swipe');
    const svg = render(<Mark rect={rect} span={[0, 4]} relation="missing_context" ink="ochre" line={1} seed="c1" />).container.querySelector('svg')!;
    expect(svg.getAttribute('style')).toContain('--frames: 7');
    expect(svg.getAttribute('style')).toContain('--line: 1');
  });

  it('wobble by the part and the span: the same seed draws the same line, another seed another', () => {
    const d = (seed: string, span: [number, number]) =>
      render(<Mark rect={rect} span={span} relation="supports" ink="support" line={0} seed={seed} />).container.querySelector('path')!.getAttribute('d');
    expect(d('c1', [0, 4])).toBe(d('c1', [0, 4]));
    expect(d('c1', [0, 4])).not.toBe(d('c2', [0, 4]));
    expect(d('c1', [0, 4])).not.toBe(d('c1', [2, 6]));
  });

  it('are finished, with no frames to play, outside a live case (the replay story, a test)', () => {
    const svg = render(<Mark rect={rect} span={[0, 4]} relation="supports" ink="support" line={0} seed="c1" />).container.querySelector('svg')!;
    expect(svg.hasAttribute('data-play')).toBe(false);
  });
});

describe('seededRandom', () => {
  it('is a fixed sequence per seed', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('usePlayOnce', () => {
  function Probe({ k, enabled }: { k: string; enabled?: boolean }) {
    return <i data-k={k} data-play={String(usePlayOnce(k, enabled))} />;
  }
  function Case({ seq, show }: { seq: number; show: string[] }) {
    return (
      <ArrivalProvider lastSeq={seq}>
        {show.map((k) => (
          <Probe key={k} k={k} />
        ))}
      </ArrivalProvider>
    );
  }
  const plays = (c: HTMLElement) => Object.fromEntries([...c.querySelectorAll('i')].map((i) => [i.dataset.k, i.dataset.play]));

  it('is still for what the first paint already had, plays what arrives later, and only once', () => {
    const { container, rerender } = render(<Case seq={5} show={['a']} />);
    expect(plays(container)).toEqual({ a: 'false' });
    rerender(<Case seq={6} show={['a', 'b']} />);
    expect(plays(container)).toEqual({ a: 'false', b: 'true' });
    // b leaves (a tab switch) and comes back: seen again is not new.
    rerender(<Case seq={7} show={['a']} />);
    rerender(<Case seq={8} show={['a', 'b', 'c']} />);
    expect(plays(container)).toEqual({ a: 'false', b: 'false', c: 'true' });
  });

  it('is off outside a provider and when not enabled', () => {
    expect(plays(render(<Probe k="x" />).container)).toEqual({ x: 'false' });
    function Late() {
      const [n] = useState(2);
      return (
        <ArrivalProvider lastSeq={n}>
          <Probe k="y" enabled={false} />
        </ArrivalProvider>
      );
    }
    expect(plays(render(<Late />).container)).toEqual({ y: 'false' });
  });
});

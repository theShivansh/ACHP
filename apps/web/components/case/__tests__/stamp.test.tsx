import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seededTilt, VERDICTS } from '@/lib/verdict';
import { Stamp, wobblyRect } from '../Stamp';
import { VerdictMark } from '../VerdictMark';

const rect = { x: 0, y: 0, width: 120, height: 24 };

describe('Stamp', () => {
  for (const label of Object.keys(VERDICTS) as (keyof typeof VERDICTS)[]) {
    it(`${label}: an image with the verdict in its label and its stamp text in caps`, () => {
      const { container } = render(<Stamp label={label} id="C1" />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-label')).toBe(`Verdict: ${VERDICTS[label].name}`);
      expect(svg.getAttribute('data-label')).toBe(label);
      expect(container.querySelector('text')!.textContent).toBe(VERDICTS[label].stamp);
    });
  }

  it('is never red for unverifiable or blocked (04 §3.3)', () => {
    for (const label of ['unverifiable', 'blocked'] as const) {
      const cls = render(<Stamp label={label} id="C1" />).container.querySelector('svg')!.getAttribute('class')!;
      expect(cls).toContain('text-graphite');
      expect(cls).not.toContain('red');
    }
  });

  it('tilts by the seeded amount and draws the same border for the same id', () => {
    const a = render(<Stamp label="mixed" id="C7" />).container.querySelector('svg')!;
    const b = render(<Stamp label="mixed" id="C7" />).container.querySelector('svg')!;
    expect(a.getAttribute('style')).toContain(`${seededTilt('C7')}deg`);
    expect(a.querySelector('path')!.getAttribute('d')).toBe(b.querySelector('path')!.getAttribute('d'));
    expect(wobblyRect(100, 30, 'x')).not.toBe(wobblyRect(100, 30, 'y'));
  });

  it('renders nothing for a value it does not know, rather than a guess', () => {
    expect(render(<Stamp label="probably-true" id="C1" />).container.innerHTML).toBe('');
  });
});

describe('VerdictMark (the Judge’s own mark on a strip)', () => {
  const mark = (label: Parameters<typeof VerdictMark>[0]['label']) =>
    render(<VerdictMark rect={rect} label={label} line={0} />).container;

  it('draws a dashed box in graphite for unverifiable, never red', () => {
    const c = mark('unverifiable');
    const box = c.querySelector('rect')!;
    expect(box.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(box.getAttribute('class')).toContain('stroke-graphite');
    expect(c.innerHTML).not.toContain('red');
  });

  it('draws a half-underline, one half green and one red, for mixed', () => {
    const paths = mark('mixed').querySelectorAll('path');
    expect([...paths].map((p) => p.getAttribute('class'))).toEqual(['stroke-support', 'stroke-pencil-red']);
  });

  it('draws an ochre caret for missing context', () => {
    expect(mark('missing_context').querySelector('path')!.getAttribute('class')).toContain('stroke-ochre');
  });

  it('draws nothing here for supported (its tick is in the margin), contradicted (the strike is on the span) or blocked', () => {
    for (const l of ['supported', 'contradicted', 'blocked'] as const) expect(mark(l).innerHTML).toBe('');
  });
});

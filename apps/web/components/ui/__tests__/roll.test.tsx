import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Roll } from '../roll';

afterEach(cleanup);

const rolling = (c: HTMLElement) => [...c.querySelectorAll('[data-roll]')].map((n) => n.textContent);

describe('Roll', () => {
  it('opens at rest: the first paint rolls nothing', () => {
    const { container } = render(<Roll value={4} />);
    expect(container.textContent).toBe('4');
    expect(rolling(container)).toEqual([]);
  });

  it('rolls only the digit that changed, and never shows a value that was not given', () => {
    const { container, rerender } = render(<Roll value="3.2s" />);
    rerender(<Roll value="3.5s" />);
    expect(container.textContent).toBe('3.5s');
    expect(rolling(container)).toEqual(['5']);
  });

  it('a count that gains a digit rolls the new digits, aligned from the right', () => {
    const { container, rerender } = render(<Roll value={9} />);
    rerender(<Roll value={10} />);
    expect(container.textContent).toBe('10');
    expect(rolling(container)).toEqual(['1', '0']);
  });

  it('a value that arrives by mounting (a lane finishing) rolls when asked to, and not otherwise', () => {
    const live = render(<Roll value="2.1s" onMount />);
    expect(rolling(live.container)).toEqual(['2', '.', '1', 's']);
    cleanup();
    const stored = render(<Roll value="2.1s" />);
    expect(rolling(stored.container)).toEqual([]);
  });

  it('keeps the number as plain text, so copying and screen readers read it whole', () => {
    const { container } = render(
      <p>
        <Roll value={12} /> sources
      </p>,
    );
    expect(container.textContent).toBe('12 sources');
  });
});

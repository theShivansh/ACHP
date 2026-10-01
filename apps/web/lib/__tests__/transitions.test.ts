import { describe, expect, it, vi } from 'vitest';
import { copiedMs, tooltipDelay } from '../motion';
import { isLowFx } from '../lowfx';
import { openCase, TO_CASE } from '../transitions';

describe('openCase', () => {
  it('goes to the case carrying the to-case transition type', () => {
    const push = vi.fn();
    openCase({ push }, 'r_abc123', '?speed=20');
    expect(push).toHaveBeenCalledWith('/case/r_abc123?speed=20', { transitionTypes: [TO_CASE] });
  });
});

describe('motion constants', () => {
  it('match the spec: a 400ms hover wait and a 1.6s "Copied"', () => {
    expect(tooltipDelay).toBe(0.4);
    expect(copiedMs).toBe(1600);
  });
});

describe('low-end devices', () => {
  it('get no boil: four or fewer cores, or data-saver', () => {
    expect(isLowFx({ hardwareConcurrency: 4 })).toBe(true);
    expect(isLowFx({ hardwareConcurrency: 8, connection: { saveData: true } })).toBe(true);
    expect(isLowFx({ hardwareConcurrency: 8 })).toBe(false);
    expect(isLowFx(undefined)).toBe(false);
  });
});

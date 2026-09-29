import { describe, expect, it, vi } from 'vitest';
import { createLinkStore } from '../../components/case/linkStore';

describe('link store', () => {
  it('lights the hovered card and its parts, and dims everything else', () => {
    const s = createLinkStore();
    expect(s.stateOf('evidence', 'e1')).toBe('idle');
    s.set({ kind: 'evidence', id: 'e1', related: ['C2'] });
    expect(s.stateOf('evidence', 'e1')).toBe('active');
    expect(s.stateOf('evidence', 'e2')).toBe('dimmed');
    expect(s.stateOf('claim', 'C2')).toBe('related');
    expect(s.stateOf('claim', 'C1')).toBe('dimmed');
    s.set(null);
    expect(s.stateOf('claim', 'C1')).toBe('idle');
  });

  it('works from a strip to its cards, and only notifies on a real change', () => {
    const s = createLinkStore();
    const spy = vi.fn();
    s.subscribe(spy);
    s.set({ kind: 'claim', id: 'C2', related: ['e1', 'e3'] });
    s.set({ kind: 'claim', id: 'C2', related: ['e1', 'e3'] });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.stateOf('evidence', 'e3')).toBe('related');
    expect(s.stateOf('evidence', 'e2')).toBe('dimmed');
  });
});

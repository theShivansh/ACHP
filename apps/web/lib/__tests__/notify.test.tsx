import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notices } from '@/components/ui/notices';
import { dismiss, NOTICE_MS, notify, useNotices } from '../notify';

describe('notices', () => {
  afterEach(() => {
    cleanup();
    const { result } = renderHook(() => useNotices());
    for (const n of result.current) act(() => dismiss(n.id));
    vi.useRealTimers();
  });

  it('shows a message in a polite live region, once, and lets the reader dismiss it', () => {
    render(<Notices />);
    act(() => {
      notify('Copying was blocked by the browser.');
      notify('Copying was blocked by the browser.');
    });
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    // The live region holds the words only; the visible notice holds the words and its Dismiss button.
    expect(region.textContent).toBe('Copying was blocked by the browser.');
    expect(document.querySelectorAll('[data-notice]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(document.querySelectorAll('[data-notice]')).toHaveLength(0);
  });

  it('leaves by itself after a while', () => {
    vi.useFakeTimers();
    render(<Notices />);
    act(() => notify('Human review is not connected yet.'));
    expect(document.querySelectorAll('[data-notice]')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(NOTICE_MS + 1));
    expect(document.querySelectorAll('[data-notice]')).toHaveLength(0);
  });
});

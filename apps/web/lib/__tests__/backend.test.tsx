import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The backend status (07 §2, S2.3): exactly what /health returned, a retry that backs off 2s → 5s → 10s, and a claim
// that waits for the desk instead of being lost.

const health = vi.fn();
vi.mock('@/lib/api', () => ({ fetchHealth: () => health() }));

import { BackendProvider, RETRY_DELAYS_MS, useBackend, type Backend } from '../backend';

let latest: Backend;
function Probe({ onValue }: { onValue: (b: Backend) => void }) {
  const b = useBackend();
  useEffect(() => {
    onValue(b);
  });
  return (
    <p data-testid="s">
      {b.status}:{b.retryInSeconds ?? '-'}
    </p>
  );
}
const mount = () =>
  render(
    <BackendProvider>
      <Probe onValue={(b) => { latest = b; }} />
    </BackendProvider>,
  );
const flush = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  vi.useFakeTimers();
  health.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BackendProvider', () => {
  it('is waking while /health is in flight, and ready when it answers', async () => {
    let answer: (v: unknown) => void = () => {};
    health.mockReturnValue(new Promise((r) => (answer = r)));
    mount();
    expect(screen.getByTestId('s').textContent).toBe('waking:-');
    await act(async () => answer({ status: 'ok' }));
    expect(screen.getByTestId('s').textContent).toBe('ready:-');
  });

  it('is unreachable on a failure, then retries after 2s, then 5s, then every 10s', async () => {
    health.mockRejectedValue(new Error('down'));
    mount();
    await flush();
    expect(screen.getByTestId('s').textContent).toBe('unreachable:2');
    expect(RETRY_DELAYS_MS).toEqual([2000, 5000, 10000]);

    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(health).toHaveBeenCalledTimes(2);
    // The seconds to the next try are a display clock that may already have ticked once.
    expect(screen.getByTestId('s').textContent).toMatch(/^unreachable:[45]$/);

    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(health).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('s').textContent).toMatch(/^unreachable:(10|9)$/);

    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(health).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('s').textContent).toMatch(/^unreachable:(10|9)$/);
  });

  it('recovers by itself when the backend comes back, and Retry tries at once', async () => {
    health.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ status: 'ok' });
    mount();
    await flush();
    expect(screen.getByTestId('s').textContent).toBe('unreachable:2');
    await act(async () => latest.retry());
    expect(screen.getByTestId('s').textContent).toBe('ready:-');
  });

  it('keeps a submitted claim waiting until the desk answers', async () => {
    let answer: (v: unknown) => void = () => {};
    health.mockReturnValue(new Promise((r) => (answer = r)));
    mount();
    let started = false;
    const waiting = latest.whenReady().then(() => {
      started = true;
    });
    await flush();
    expect(started).toBe(false);
    await act(async () => answer({ status: 'ok' }));
    await waiting;
    expect(started).toBe(true);
  });

  it('lets a waiting claim be given up', async () => {
    health.mockReturnValue(new Promise(() => {}));
    mount();
    const ctl = new AbortController();
    const p = latest.whenReady(ctl.signal);
    ctl.abort();
    await expect(p).rejects.toThrow('Aborted');
  });
});

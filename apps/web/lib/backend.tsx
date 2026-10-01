'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchHealth } from '@/lib/api';

// The backend's state as the desk shows it (07 §2, S2.3). It is exactly what GET /health returned: a request still
// in flight is "waking" (free-tier servers sleep when idle and the first request wakes them), an answer is "ready", a
// failure is "unreachable". A failure retries by itself after 2s, then 5s, then every 10s, and `retry()` tries now.
// The seconds are a display clock for the waiting reader; they never decide anything. A claim submitted while the
// backend is not ready stays on the sheet and `whenReady()` resolves once /health answers.

export type BackendStatus = 'waking' | 'ready' | 'unreachable';

export const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;
/** After it answered, the backend is checked again this often, so a stopped one is noticed. */
export const RECHECK_MS = 30_000;

export interface Backend {
  status: BackendStatus;
  /** Whole seconds since the first request, while waking. */
  elapsedSeconds: number;
  /** Whole seconds until the next automatic retry, while unreachable. */
  retryInSeconds: number | null;
  retry: () => void;
  /** Resolves once the backend has answered. Rejects only if `signal` aborts first. */
  whenReady: (signal?: AbortSignal) => Promise<void>;
}

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>('waking');
  const [elapsedSeconds, setElapsed] = useState(0);
  const [retryInSeconds, setRetryIn] = useState<number | null>(null);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiters = useRef(new Set<() => void>());
  const startedAt = useRef<number | null>(null);
  const statusRef = useRef<BackendStatus>('waking');
  const mounted = useRef(false);

  const set = useCallback((s: BackendStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const ping = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRetryIn(null);
    if (statusRef.current !== 'ready') {
      // A retry after a failure shows as waking again while it is in flight, so the seconds keep counting.
      set('waking');
    }
    startedAt.current ??= Date.now();
    try {
      await fetchHealth();
      if (!mounted.current) return;
      attempt.current = 0;
      set('ready');
      for (const w of waiters.current) w();
      waiters.current.clear();
      timer.current = setTimeout(() => void ping(), RECHECK_MS);
    } catch {
      if (!mounted.current) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
      attempt.current += 1;
      set('unreachable');
      setRetryIn(Math.round(delay / 1000));
      timer.current = setTimeout(() => void ping(), delay);
    }
  }, [set]);

  useEffect(() => {
    mounted.current = true;
    void ping();
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ping]);

  // The display clocks: seconds waiting, seconds to the next retry.
  useEffect(() => {
    if (status === 'ready') return;
    const id = setInterval(() => {
      if (statusRef.current === 'waking') setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
      setRetryIn((s) => (s != null && s > 1 ? s - 1 : s));
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  const retry = useCallback(() => {
    attempt.current = 0;
    void ping();
  }, [ping]);

  const whenReady = useCallback((signal?: AbortSignal) => {
    if (statusRef.current === 'ready') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        waiters.current.delete(done);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      waiters.current.add(done);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }, []);

  const value = useMemo<Backend>(
    () => ({ status, elapsedSeconds, retryInSeconds, retry, whenReady }),
    [status, elapsedSeconds, retryInSeconds, retry, whenReady],
  );
  return <BackendContext value={value}>{children}</BackendContext>;
}

export function useBackend(): Backend {
  const b = useContext(BackendContext);
  if (!b) throw new Error('useBackend needs a BackendProvider');
  return b;
}

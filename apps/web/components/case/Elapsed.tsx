'use client';

import { useEffect, useState } from 'react';

// "Working · 3.2s" (06 §4.1). A display clock, never run state: it counts real time since the real
// agent.started, as the server's t_ms up to the latest event plus the wall time since that event
// arrived. It ticks only while mounted for a working lane, so an idle page is fully still.

export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export function Elapsed({
  startedAtMs,
  lastTMs,
  receivedAt,
  rate = 1,
}: {
  startedAtMs: number;
  /** t_ms of the latest applied event. */
  lastTMs: number;
  /** performance.now() when that event arrived (null: replayed from a stored log). */
  receivedAt: number | null;
  /** Fixture playback speed, so the clock matches the replayed timing. */
  rate?: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (receivedAt == null) return;
    const tick = () => setNow(performance.now());
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [receivedAt]);

  const sinceEvent = receivedAt != null && now != null ? Math.max(0, now - receivedAt) * rate : 0;
  return <span className="tabular-nums">{formatSeconds(lastTMs - startedAtMs + sinceEvent)}</span>;
}

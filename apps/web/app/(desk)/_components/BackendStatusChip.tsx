'use client';

import { StatusChip } from '@/components/ui/status-chip';
import { useBackend } from '@/lib/backend';

// The chip shows what GET /health actually returned: in flight → waking (with the seconds, once they are noticeable),
// ok → ready, failed → unreachable with a Retry and the time to the next automatic try (07 §3.3, S2.3). The old UI
// showed "Offline" while the first request was pending (A8).
export function BackendStatusChip() {
  const b = useBackend();
  return <StatusChip status={b.status} elapsedSeconds={b.elapsedSeconds} retryInSeconds={b.retryInSeconds} onRetry={b.retry} />;
}

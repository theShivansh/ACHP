'use client';

import { StatusChip, type BackendStatus } from '@/components/ui/status-chip';
import { useHealth } from '@/lib/api';

// The chip shows what GET /health actually returned: in flight → waking, ok → ready,
// failed → unreachable. (The old UI showed "Offline" while the first request was pending: A8.)
// P9 adds the elapsed-seconds count and the cold-start lamp.
export function BackendStatusChip() {
  const health = useHealth();
  const status: BackendStatus = health.isSuccess ? 'ready' : health.isError ? 'unreachable' : 'waking';
  return <StatusChip status={status} />;
}

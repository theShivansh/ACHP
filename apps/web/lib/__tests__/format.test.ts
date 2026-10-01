import { describe, expect, it } from 'vitest';
import { formatBytes, timeAgo } from '../format';

describe('format', () => {
  it('says sizes in words a reader knows', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(120_000)).toBe('117 KB');
    expect(formatBytes(2_400_000)).toBe('2.3 MB');
  });

  it('says how long ago, never a clock that ticks', () => {
    const now = Date.UTC(2026, 9, 1, 12);
    expect(timeAgo(now - 20_000, now)).toBe('just now');
    expect(timeAgo(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(timeAgo(now - 2 * 3600_000, now)).toBe('2 hours ago');
    expect(timeAgo(now - 30 * 3600_000, now)).toBe('yesterday');
    expect(timeAgo(now - 5 * 86400_000, now)).toBe('5 days ago');
  });
});

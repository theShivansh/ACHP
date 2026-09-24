import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunConnection, type ConnectionStatus } from '../connection';
import type { RunEvent } from '../types';
import { log } from './load';

class FakeES {
  static all: FakeES[] = [];
  listeners = new Map<string, ((m: MessageEvent) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeES.all.push(this);
  }
  addEventListener(type: string, fn: (m: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  send(e: RunEvent) {
    for (const fn of this.listeners.get(e.type) ?? []) fn({ data: JSON.stringify(e) } as MessageEvent);
  }
  ping() {
    for (const fn of this.listeners.get('ping') ?? []) fn({ data: '{}' } as MessageEvent);
  }
  error() {
    this.onerror?.();
  }
}

const events = log('mixed');
const RID = events[0].run_id;

function setup(fetchEvents: (since: number) => RunEvent[] | Promise<RunEvent[]> = () => []) {
  const got: RunEvent[] = [];
  const statuses: ConnectionStatus[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    const since = Number(new URL(url).searchParams.get('since') ?? 0);
    return new Response(JSON.stringify({ run_id: RID, events: await fetchEvents(since) }));
  }) as unknown as typeof fetch;
  const c = new RunConnection(
    RID,
    { baseUrl: 'http://api.test', EventSourceImpl: FakeES as unknown as typeof EventSource, fetchImpl },
    (evs) => got.push(...evs),
    (s) => statuses.push(s),
  );
  c.start();
  return { c, got, statuses, fetchImpl, es: () => FakeES.all.at(-1)! };
}

beforeEach(() => {
  FakeES.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('RunConnection', () => {
  it('delivers events in order, ignores duplicates and closes on the terminal event', () => {
    const { got, statuses, es } = setup();
    expect(es().url).toBe(`http://api.test/runs/${RID}/events`);
    for (const e of events.slice(0, 5)) es().send(e);
    es().send(events[2]);
    for (const e of events.slice(5)) es().send(e);
    expect(got.map((e) => e.seq)).toEqual(events.map((e) => e.seq));
    expect(es().closed).toBe(true);
    expect(statuses).toEqual(['connecting', 'live', 'closed']);
  });

  it('repairs a gap from events.json before delivering later events', async () => {
    const { got, fetchImpl, es } = setup((since) => events.filter((e) => e.seq > since));
    es().send(events[0]);
    es().send(events[4]); // seq 2-4 missing
    expect(got.map((e) => e.seq)).toEqual([1]);
    await vi.waitFor(() => expect(got.length).toBe(events.length));
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('events.json?since=1');
    expect(got.map((e) => e.seq)).toEqual(events.map((e) => e.seq));
  });

  it('a silent stream trips the 20s watchdog; pings keep it alive', () => {
    const { statuses, es } = setup();
    es().send(events[0]);
    vi.advanceTimersByTime(15_000);
    es().ping();
    vi.advanceTimersByTime(15_000);
    expect(statuses.at(-1)).toBe('live');
    vi.advanceTimersByTime(5_001);
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('reconnects with ?since= after 1s, 3s, 7s, polls from the second failure, then is interrupted', async () => {
    const { statuses, es, fetchImpl } = setup(() => []);
    es().send(events[0]);
    es().send(events[1]);
    es().error();
    expect(statuses.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeES.all).toHaveLength(2);
    expect(es().url).toBe(`http://api.test/runs/${RID}/events?since=2`);
    es().error();
    await vi.advanceTimersByTimeAsync(2_000); // polling has started
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeES.all).toHaveLength(3);
    es().error();
    await vi.advanceTimersByTimeAsync(7_000);
    expect(FakeES.all).toHaveLength(4);
    es().error();
    expect(statuses.at(-1)).toBe('interrupted');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeES.all).toHaveLength(4);
  });

  it('polling delivers real events while the stream is down, and retry() starts over', async () => {
    const { got, statuses, es, c } = setup((since) => events.filter((e) => e.seq > since && e.seq <= 6));
    es().send(events[0]);
    es().error();
    await vi.advanceTimersByTimeAsync(1_000);
    es().error();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    es().error();
    await vi.advanceTimersByTimeAsync(7_000);
    es().error();
    expect(statuses.at(-1)).toBe('interrupted');
    c.retry();
    expect(statuses.at(-1)).toBe('connecting');
    expect(es().url).toContain('?since=6');
  });

  it('refuses frames from another run or that are not v2 envelopes', () => {
    const { got, es } = setup();
    es().send({ ...events[0], run_id: 'r_other' } as RunEvent);
    for (const fn of es().listeners.get('run.started') ?? []) fn({ data: 'not json' } as MessageEvent);
    expect(got).toEqual([]);
  });
});

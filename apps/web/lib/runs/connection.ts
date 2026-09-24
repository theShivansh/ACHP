// Live connection to one run's event log (06 §7). Delivers events strictly in seq order.
// - EventSource on /runs/{id}/events; frames carry `id:` so a native reconnect resends
//   Last-Event-ID, and our own reconnects pass `?since=` the last applied seq.
// - Watchdog: no event or ping for 20s → the connection is treated as dropped.
// - A seq gap is repaired from /events.json?since= before later events are delivered.
// - Reconnects back off 1s, 3s, 7s; from the second failure the log is also polled every 2s;
//   after the third failed reconnect the connection is `interrupted` and `retry()` starts over.
// These timers only manage the connection. Run state changes only when a real event arrives.

import { fetchEvents } from './api';
import { EVENT_TYPES, isRunEvent, isTerminal, type RunEvent } from './types';

export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'interrupted' | 'closed';

type Timer = ReturnType<typeof setTimeout>;

export interface ConnectionOptions {
  baseUrl: string;
  EventSourceImpl?: typeof EventSource;
  fetchImpl?: typeof fetch;
  watchdogMs?: number;
  backoffMs?: readonly number[];
  pollMs?: number;
}

export class RunConnection {
  private es: EventSource | null = null;
  private lastSeq: number;
  private pending = new Map<number, RunEvent>();
  private repairing = false;
  private failures = 0;
  private watchdog: Timer | null = null;
  private reconnectTimer: Timer | null = null;
  private pollTimer: Timer | null = null;
  private done = false;
  private status: ConnectionStatus = 'idle';
  private readonly opts: Required<ConnectionOptions>;

  constructor(
    readonly runId: string,
    opts: ConnectionOptions,
    private readonly onEvents: (events: RunEvent[]) => void,
    private readonly notifyStatus: (status: ConnectionStatus) => void,
    afterSeq = 0,
  ) {
    this.lastSeq = afterSeq;
    this.opts = {
      EventSourceImpl: globalThis.EventSource,
      fetchImpl: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
      watchdogMs: 20_000,
      backoffMs: [1_000, 3_000, 7_000],
      pollMs: 2_000,
      ...opts,
    };
  }

  private onStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.notifyStatus(status);
  }

  start(): void {
    if (this.done) return;
    this.onStatus(this.failures ? 'reconnecting' : 'connecting');
    const url = `${this.opts.baseUrl}/runs/${encodeURIComponent(this.runId)}/events${
      this.lastSeq ? `?since=${this.lastSeq}` : ''
    }`;
    const es = new this.opts.EventSourceImpl(url);
    this.es = es;
    const onFrame = (msg: MessageEvent) => this.frame(msg);
    for (const type of EVENT_TYPES) es.addEventListener(type, onFrame as EventListener);
    es.addEventListener('ping', () => this.alive());
    es.onerror = () => {
      if (!this.done) this.fail();
    };
    this.armWatchdog();
  }

  retry(): void {
    if (this.done) return;
    this.failures = 0;
    this.teardown();
    this.start();
  }

  close(): void {
    this.done = true;
    this.teardown();
  }

  private teardown(): void {
    this.es?.close();
    this.es = null;
    for (const t of [this.watchdog, this.reconnectTimer, this.pollTimer]) if (t) clearTimeout(t);
    this.watchdog = this.reconnectTimer = this.pollTimer = null;
  }

  private armWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.fail(), this.opts.watchdogMs);
  }

  private alive(): void {
    if (this.done) return;
    if (this.failures) {
      this.failures = 0;
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.onStatus('live');
    this.armWatchdog();
  }

  private frame(msg: MessageEvent): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(msg.data));
    } catch {
      return;
    }
    if (!isRunEvent(parsed) || parsed.run_id !== this.runId) return;
    this.alive();
    this.accept([parsed]);
  }

  /** Deliver in seq order; hold anything past a gap and repair the gap from events.json. */
  private accept(events: RunEvent[]): void {
    for (const e of events) if (e.seq > this.lastSeq) this.pending.set(e.seq, e);
    const batch: RunEvent[] = [];
    while (this.pending.has(this.lastSeq + 1)) {
      const next = this.pending.get(this.lastSeq + 1)!;
      this.pending.delete(next.seq);
      this.lastSeq = next.seq;
      batch.push(next);
    }
    if (batch.length) {
      this.onEvents(batch);
      if (batch.some(isTerminal)) {
        this.close();
        this.onStatus('closed');
        return;
      }
    }
    if (this.pending.size) void this.repair();
  }

  private async repair(): Promise<void> {
    if (this.repairing || this.done) return;
    this.repairing = true;
    try {
      const missing = await fetchEvents(this.runId, this.lastSeq, this.opts.baseUrl, this.opts.fetchImpl);
      this.repairing = false;
      if (!this.done) this.accept(missing);
    } catch {
      this.repairing = false; // the next frame or poll tries again
    }
  }

  private fail(): void {
    if (this.done) return;
    this.teardown();
    this.failures += 1;
    const { backoffMs } = this.opts;
    if (this.failures > backoffMs.length) {
      this.onStatus('interrupted');
      return;
    }
    this.onStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => this.start(), backoffMs[this.failures - 1]);
    if (this.failures >= 2) this.poll();
  }

  private poll(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (this.done || !this.failures) return;
      try {
        this.accept(await fetchEvents(this.runId, this.lastSeq, this.opts.baseUrl, this.opts.fetchImpl));
      } catch {
        /* keep polling while reconnecting */
      }
      if (!this.done && this.failures) this.poll();
    }, this.opts.pollMs);
  }
}

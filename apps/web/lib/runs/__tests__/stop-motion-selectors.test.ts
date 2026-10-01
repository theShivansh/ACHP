import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOIL_BUDGET, boilingLanes, flaggedSpans, initialRunState, laneSignals, reduceAll, reduceRun } from '../reducer';
import type { RunEvent } from '../types';
import { FIXTURE_DIR, log, readLog } from './load';

// P8: what the stop-motion layer reads from run state (05 §3.2, §3.4). Pure selectors over the reducer's state.

const mixed = readLog(path.join(FIXTURE_DIR, 'exercise-mixed.jsonl'));

describe('boilingLanes (the boil budget)', () => {
  it('boils only working lanes, at most three, the most recently started first', () => {
    let s = initialRunState();
    let max = 0;
    for (const e of mixed) {
      s = reduceRun(s, e);
      const b = boilingLanes(s);
      max = Math.max(max, b.size);
      for (const id of b) expect(s.lanes[id].state).toBe('working');
      expect(b.size).toBeLessThanOrEqual(BOIL_BUDGET);
    }
    expect(max).toBeGreaterThan(0);
    // Nothing boils once the run is over.
    expect(boilingLanes(s).size).toBe(0);
  });

  it('keeps the three newest when more than three lanes work at once', () => {
    const base = reduceAll(mixed.slice(0, mixed.findIndex((e) => e.type === 'run.started') + 1));
    const ids = base.agentOrder.slice(0, 5);
    const s = {
      ...base,
      lanes: Object.fromEntries(
        Object.entries(base.lanes).map(([id, l]) => {
          const i = ids.indexOf(id);
          return [id, i >= 0 ? { ...l, state: 'working' as const, startedAtMs: i * 100 } : l];
        }),
      ),
    };
    expect([...boilingLanes(s)].sort()).toEqual(ids.slice(2).sort());
  });

  it('boils nothing while the connection is lost, or once the run is not running', () => {
    let s = initialRunState();
    for (const e of mixed) {
      s = reduceRun(s, e);
      if (boilingLanes(s).size) break;
    }
    expect(boilingLanes(s).size).toBeGreaterThan(0);
    expect(boilingLanes(s, false).size).toBe(0);
    expect(boilingLanes({ ...s, status: 'completed' }).size).toBe(0);
  });
});

describe('laneSignals (the tally)', () => {
  it('lists each finished wording check once, by agent, in arrival order', () => {
    const s = reduceAll(mixed);
    expect(laneSignals(s)).toEqual({ nil_supervisor: ['sentiment', 'bias', 'perspective', 'framing', 'hedging'] });
  });

  it('is empty before any check', () => {
    expect(laneSignals(initialRunState())).toEqual({});
  });
});

describe('flaggedSpans (the highlighter over the claim)', () => {
  it('merges overlapping spans across the checks and keeps the earliest seq of each', () => {
    const s = reduceAll(mixed);
    const spans = flaggedSpans(s);
    expect(spans.map((x) => x.span)).toEqual([
      [17, 33],
      [76, 107],
    ]);
    const firstSignal = mixed.find((e) => e.type === 'signal.computed')!.seq;
    expect(spans[0].seq).toBe(firstSignal);
  });

  it('drops empty and reversed spans and needs no signals', () => {
    expect(flaggedSpans(initialRunState())).toEqual([]);
    const head = mixed.slice(0, mixed.findIndex((e) => e.type === 'run.started') + 1);
    const bad: RunEvent = {
      ...(mixed.find((e) => e.type === 'signal.computed') as RunEvent),
      seq: head.length + 1,
      data: { signal: 'hedging', label: 'none', spans: [[5, 5], [9, 3]] },
    } as RunEvent;
    expect(flaggedSpans(reduceAll([...head, bad]))).toEqual([]);
  });

  it('works on every synthetic log', () => {
    for (const name of ['mixed', 'quiet-falsehood', 'true-but-loaded']) {
      for (const f of flaggedSpans(reduceAll(log(name)))) expect(f.span[1]).toBeGreaterThan(f.span[0]);
    }
  });
});

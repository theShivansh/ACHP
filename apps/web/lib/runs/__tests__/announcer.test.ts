import { describe, expect, it } from 'vitest';
import { createAnnouncer, describe as describeEvent } from '../announcer';
import { reduceAll } from '../reducer';
import type { RunEvent } from '../types';
import { allLogs, log } from './load';

function nameOf(events: RunEvent[]) {
  const s = reduceAll(events.slice(0, 1));
  return (id: string | null) => (id && s.lanes[id]?.name) || 'The desk';
}

function harness() {
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const said: string[] = [];
  const clock = {
    now: () => t,
    schedule: (fn: () => void, ms: number) => {
      const h = { at: t + ms, fn };
      timers.push(h);
      return h;
    },
    cancel: (h: unknown) => {
      const i = timers.indexOf(h as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms: number) {
      t += ms;
      for (const h of [...timers].sort((a, b) => a.at - b.at)) {
        if (h.at <= t) {
          timers.splice(timers.indexOf(h), 1);
          h.fn();
        }
      }
    },
  };
  return { said, clock };
}

describe('announcer: event → sentence', () => {
  const events = log('mixed');
  const names = nameOf(events);

  it('announces notes, completions and the verdict in plain sentences', () => {
    const texts = events.map((e) => describeEvent(e, names)?.text).filter(Boolean);
    expect(texts).toContain('Clipper: Pinned 1 source: 1 from the web.');
    expect(texts).toContain('Decomposer finished. Cut the message into 2 checkable parts.');
    expect(texts.find((t) => t!.startsWith('Verdict: mixed. Confidence '))).toBeTruthy();
    expect(texts.at(-1)).toBe('Check complete.');
  });

  it('stays quiet for fine-grained events and never reads out numbers as percentages', () => {
    for (const e of events) {
      const a = describeEvent(e, names);
      if (['agent.action', 'evidence.found', 'claim.extracted', 'claim.marked', 'signal.computed'].includes(e.type)) {
        expect(a).toBeNull();
      }
      expect(a?.text ?? '').not.toMatch(/%/);
    }
  });

  it('says a failed run produced no verdict', () => {
    const failed = log('failed-judge');
    const last = describeEvent(failed.at(-1)!, nameOf(failed));
    expect(last?.text).toMatch(/No verdict was produced\.$/);
  });

  it('every log yields sentences without raw ids or underscores', () => {
    for (const { events: evs } of allLogs()) {
      const n = nameOf(evs);
      for (const e of evs) expect(describeEvent(e, n)?.text ?? '').not.toMatch(/_[a-z]|\bnull\b|undefined/);
    }
  });
});

describe('announcer: throttle', () => {
  it('says at most one sentence per 2s, keeps the most important and dedupes', () => {
    const events = log('mixed');
    const { said, clock } = harness();
    const a = createAnnouncer((t) => said.push(t), nameOf(events), clock);
    for (const e of events) a.push(e); // the whole run arrives at once
    expect(said).toHaveLength(1); // the first sentence goes out immediately
    clock.advance(1999);
    expect(said).toHaveLength(1);
    clock.advance(1);
    expect(said).toHaveLength(2);
    expect(said[1]).toMatch(/^Verdict: mixed\./); // the verdict outranks the notes that queued up
    clock.advance(10_000);
    expect(said).toHaveLength(2);
  });

  it('spaces sentences that arrive slowly and drops repeats', () => {
    const events = log('mixed');
    const { said, clock } = harness();
    const a = createAnnouncer((t) => said.push(t), nameOf(events), clock);
    const done = events.filter((e) => e.type === 'agent.done');
    a.push(done[0]);
    a.push(done[0]);
    clock.advance(3000);
    a.push(done[1]);
    expect(said).toEqual(['Gatekeeper finished. Safe to check.', 'Clipper finished. Pinned 1 source: 1 from the web.']);
    a.dispose();
  });

  it('learns agent names from run.started when no lookup is given', () => {
    const events = log('mixed');
    const { said, clock } = harness();
    const a = createAnnouncer((t) => said.push(t), undefined, clock);
    a.push(events[0]);
    clock.advance(2000);
    a.push(events.find((e) => e.type === 'agent.done')!);
    expect(said.at(-1)).toBe('Gatekeeper finished. Safe to check.');
  });
});

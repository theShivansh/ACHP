import { describe, expect, it } from 'vitest';
import { initialRunState, laneCounts, lanes, reduceAll, reduceRun, type RunState } from '../reducer';
import type { RunEvent } from '../types';
import { allLogs, log } from './load';

const snap = (s: RunState) => ({ ...s, events: s.events.length });

describe('reducer: every log → final state', () => {
  for (const { name, events } of allLogs()) {
    it(`${name}`, () => {
      const s = reduceAll(events);
      expect(s.problems).toEqual([]);
      expect(s.lastSeq).toBe(events.length);
      expect(snap(s)).toMatchSnapshot();
    });
  }
});

describe('reducer: idempotence and ordering', () => {
  it('applying a log twice gives the same state, and a duplicate returns the same object', () => {
    for (const { events } of allLogs()) {
      const once = reduceAll(events);
      expect(reduceAll([...events, ...events])).toEqual(once);
      expect(reduceRun(once, events[3])).toBe(once);
    }
  });

  it('rejects and reports a gap, then accepts the missing event and continues', () => {
    const events = log('mixed');
    const s3 = reduceAll(events.slice(0, 3));
    const gap = reduceRun(s3, events[4]);
    expect(gap.lastSeq).toBe(3);
    expect(gap.problems).toEqual([{ seq: 5, expected: 4, reason: 'gap' }]);
    expect(gap.events).toHaveLength(3);
    const repaired = reduceAll(events.slice(3), gap);
    expect(repaired.lastSeq).toBe(events.length);
    expect(repaired.verdict).toEqual(reduceAll(events).verdict);
  });

  it('rejects events from another run', () => {
    const events = log('mixed');
    const s = reduceAll(events.slice(0, 2));
    const other = { ...events[2], run_id: 'r_other' } as RunEvent;
    expect(reduceRun(s, other).problems[0].reason).toBe('wrong_run');
    expect(reduceRun(s, other).lastSeq).toBe(2);
  });

  it('freezes after the terminal event: a late verdict can never appear on a failed run', () => {
    const failed = reduceAll(log('failed-judge'));
    const lateVerdict = log('mixed').find((e) => e.type === 'verdict.final')!;
    const late = { ...lateVerdict, run_id: failed.runId!, seq: failed.lastSeq + 1 } as RunEvent;
    const after = reduceRun(failed, late);
    expect(after.verdict).toBeNull();
    expect(after.lastSeq).toBe(failed.lastSeq);
    expect(after.problems.at(-1)?.reason).toBe('after_terminal');
  });

  it('never reads a clock: the same log gives the same state at any time', () => {
    const events = log('second-round');
    expect(reduceAll(events)).toEqual(reduceAll(events));
  });
});

describe('reducer: run and lane state machines (06 §4)', () => {
  it('golden path: lanes built from run.started, every lane done, marks on strips, verdict', () => {
    const s = reduceAll(log('mixed'));
    expect(s.status).toBe('completed');
    expect(s.agentOrder).toEqual([
      'security_validator', 'retriever', 'proposer', 'adversary_a', 'adversary_b', 'nil_supervisor', 'judge',
    ]);
    expect(laneCounts(s).done).toBe(7);
    expect(s.lanes.judge.model).toBe('openai/gpt-oss-120b');
    expect(s.lanes.judge.fallbackModel).toBe('openai/gpt-oss-20b');
    expect(s.lanes.judge.servedBy).toBe('openai/gpt-oss-120b');
    expect(s.lanes.retriever.model).toBeNull();
    expect(s.claimOrder).toEqual(['C1', 'C2']);
    const mark = s.claims.C2.marks[0];
    expect(s.claims.C2.text.slice(...mark.span)).toBe('30 to 40 percent');
    expect(mark.evidence_ids).toEqual(['e1']);
    expect(Object.keys(s.signals).sort()).toEqual(['bias', 'framing', 'hedging', 'perspective', 'sentiment']);
    expect(s.verdict?.overall.label).toBe('mixed');
    expect(s.evidenceOrder).toEqual(['e1']);
  });

  it('lane goes queued → working → done and keeps the latest action until done', () => {
    const events = log('mixed');
    const upTo = (pred: (e: RunEvent) => boolean) => reduceAll(events.slice(0, events.findIndex(pred) + 1));
    expect(upTo((e) => e.type === 'run.started').lanes.proposer.state).toBe('queued');
    const working = upTo((e) => e.type === 'agent.action' && e.agent === 'proposer');
    expect(working.lanes.proposer.state).toBe('working');
    expect(working.lanes.proposer.action?.label).toBe('Cutting the message into parts');
    const done = upTo((e) => e.type === 'agent.done' && e.agent === 'proposer');
    expect(done.lanes.proposer.state).toBe('done');
    expect(done.lanes.proposer.summary).toBe('Cut the message into 2 checkable parts');
  });

  it('second round: judge waits, the challenger works again, then the judge finishes', () => {
    const events = log('second-round');
    const i = events.findIndex((e) => e.type === 'debate.round');
    const waiting = reduceAll(events.slice(0, i + 1));
    expect(waiting.lanes.judge.state).toBe('waiting');
    expect(waiting.debateRounds[0].reason).toBe('Sources conflict on the percentage.');
    const again = reduceAll(events.slice(0, i + 2));
    expect(again.lanes.adversary_a.state).toBe('working');
    expect(again.lanes.adversary_a.round).toBe(2);
    const end = reduceAll(events);
    expect(end.lanes.judge.state).toBe('done');
    expect(end.lanes.judge.round).toBe(2);
  });

  it('failed run: the failing lane is failed, finished lanes keep their outputs, no verdict', () => {
    const s = reduceAll(log('failed-judge'));
    expect(s.status).toBe('failed');
    expect(s.failure?.stage).toBe('judge');
    expect(s.lanes.judge.state).toBe('failed');
    expect(s.lanes.adversary_a.state).toBe('done');
    expect(s.claimOrder.length).toBe(2);
    expect(s.verdict).toBeNull();
  });

  it('a backstop run.failed closes lanes that were still working', () => {
    const events = log('mixed');
    const i = events.findIndex((e) => e.type === 'agent.started' && e.agent === 'judge');
    const partial = reduceAll(events.slice(0, i + 1));
    const failed = {
      v: 2, run_id: partial.runId!, seq: partial.lastSeq + 1, ts: '', t_ms: 0, type: 'run.failed', agent: null,
      data: { stage: 'server', error_code: 'server_restarted', message: 'The server restarted.', retryable: true },
    } as RunEvent;
    const s = reduceRun(partial, failed);
    expect(s.lanes.judge.state).toBe('failed');
    expect(s.lanes.judge.error?.code).toBe('server_restarted');
    expect(s.lanes.proposer.state).toBe('done');
  });

  it('blocked run: later lanes skipped, a blocked verdict with no metrics', () => {
    for (const events of [log('blocked'), ...allLogs().filter((l) => l.name === 'fixture/blocked').map((l) => l.events)]) {
      const s = reduceAll(events);
      expect(s.status).toBe('completed');
      expect(lanes(s).filter((l) => l.state === 'skipped').map((l) => l.id)).toEqual([
        'retriever', 'proposer', 'adversary_a', 'adversary_b', 'nil_supervisor', 'judge',
      ]);
      expect(s.verdict?.overall.label).toBe('blocked');
      expect(s.verdict?.metrics ?? null).toBeNull();
      expect(s.claimOrder).toEqual([]);
    }
  });

  it('no sources: unverifiable with a weak band', () => {
    const s = reduceAll(log('no-sources'));
    expect(s.verdict?.overall.label).toBe('unverifiable');
    expect(s.verdict?.overall.confidence_band).toBe('weak');
    expect(s.evidenceOrder).toEqual([]);
  });

  it('queued: position until run.started', () => {
    const q: RunEvent = { v: 2, run_id: 'r_q', seq: 1, ts: '', t_ms: 0, type: 'run.queued', agent: null, data: { position: 2 } };
    const s = reduceRun(initialRunState('r_q'), q);
    expect(s.status).toBe('queued');
    expect(s.queuePosition).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { buildChapters, CHAPTER_IDS, gateCount } from '../chapters';
import type { RunEvent } from '../types';
import { allLogs } from './load';

const logs = allLogs();
const log = (name: string) => logs.find((l) => l.name === name)!.events;

/** Every string in a log a caption may be built from (public notes, summaries, reasons, the claim, the verdict). */
function sources(events: RunEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === 'run.started') out.push(e.data.input.text);
    if (e.type === 'agent.done') out.push(e.data.summary);
    if (e.type === 'agent.skipped') out.push(e.data.reason);
    if (e.type === 'agent.note') out.push(e.data.note);
    if (e.type === 'verdict.final') out.push(e.data.overall.summary);
    if (e.type === 'run.failed') out.push(e.data.message);
  }
  return out.map((s) => s.replace(/\s+/g, ' ').trim());
}

describe('chapters: every log', () => {
  for (const { name, events } of logs) {
    describe(name, () => {
      const chapters = buildChapters(events);

      it('has the seven chapters, in order', () => {
        expect(chapters.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
      });

      it('holds every event exactly once, in seq order', () => {
        const all = chapters.flatMap((c) => c.events.map((e) => e.seq));
        expect([...all].sort((a, b) => a - b)).toEqual(events.map((e) => e.seq).sort((a, b) => a - b));
        for (const c of chapters) expect(c.events.map((e) => e.seq)).toEqual([...c.events.map((e) => e.seq)].sort((a, b) => a - b));
      });

      it('has at most two gates, one per allowed trigger, on the chapter holding the mark', () => {
        expect(gateCount(chapters)).toBeLessThanOrEqual(2);
        const kinds = chapters.flatMap((c) => c.gates.map((g) => g.kind));
        expect(new Set(kinds).size).toBe(kinds.length);
        for (const c of chapters)
          for (const g of c.gates) {
            expect(c.events.some((e) => e.seq === g.seq && e.type === 'claim.marked')).toBe(true);
            expect(c.gate).toBe(true);
          }
      });

      it('opens a gate only for the FIRST contradiction and the FIRST missing-context mark', () => {
        const marks = events.filter((e) => e.type === 'claim.marked');
        const first = (rel: string) => marks.find((m) => m.type === 'claim.marked' && m.data.relation === rel)?.seq;
        const gates = chapters.flatMap((c) => c.gates);
        expect(gates.find((g) => g.kind === 'contradiction')?.seq).toBe(first('contradicts'));
        expect(gates.find((g) => g.kind === 'missing_context')?.seq).toBe(first('missing_context'));
      });

      it('words each caption from the log: a note, a summary, a skip reason, the claim or the verdict', () => {
        const pool = sources(events);
        for (const c of chapters) {
          if (!c.caption) continue;
          expect(c.caption.length).toBeLessThanOrEqual(200);
          expect(c.caption).toMatch(/[.!?…”]$/);
          const body = c.caption.replace(/[.]$/, '').replace(/^“|”$/g, '');
          for (const part of body.split(' · ')) {
            expect(pool.some((s) => s.includes(part.replace(/…$/, '').replace(/[.]$/, ''))), `${c.id}: "${part}"`).toBe(true);
          }
        }
      });
    });
  }
});

describe('chapters: what each recorded run says', () => {
  it('a run with no contradiction and no missing context has no gate', () => {
    expect(gateCount(buildChapters(log('fixture/all-supported')))).toBe(0);
  });

  it('a contradicted run opens the contradiction gate first, then the missing-context gate, both in Challenge', () => {
    const c = buildChapters(log('fixture/contradicted-strong'));
    const challenge = c.find((x) => x.id === 'challenge')!;
    expect(challenge.gate).toBe(true);
    expect(challenge.gates.map((g) => g.kind)).toEqual(['contradiction', 'missing_context']);
    expect(challenge.gates[0].evidenceIds.length + (challenge.gates[0].note ? 1 : 0)).toBeGreaterThan(0);
    expect(c.filter((x) => x.gate).map((x) => x.id)).toEqual(['challenge']);
  });

  it('a run with only a missing-context finding has one gate', () => {
    const gates = buildChapters(log('fixture/exercise-mixed')).flatMap((c) => c.gates);
    expect(gates.map((g) => g.kind)).toEqual(['missing_context']);
  });

  it('a blocked run says, from the log, that the later agents did not run', () => {
    const c = buildChapters(log('fixture/blocked'));
    expect(gateCount(c)).toBe(0);
    for (const id of ['sources', 'parts', 'challenge', 'framing'] as const) {
      const ch = c.find((x) => x.id === id)!;
      expect(ch.skipped, id).toBe(true);
      expect(ch.caption.length).toBeGreaterThan(0);
    }
    expect(c.find((x) => x.id === 'gatekeeper')!.skipped).toBe(false);
  });

  it('the verdict chapter carries the Judge’s own summary', () => {
    const events = log('fixture/exercise-mixed');
    const v = events.find((e) => e.type === 'verdict.final');
    const cap = buildChapters(events).find((c) => c.id === 'verdict')!.caption;
    expect(v?.type === 'verdict.final' && cap.startsWith(v.data.overall.summary.replace(/[.]$/, ''))).toBe(true);
  });

  it('a failed run keeps its chapters and ends on the failure message', () => {
    const c = buildChapters(log('synthetic/synthetic-failed-judge'));
    expect(c.map((x) => x.id)).toEqual([...CHAPTER_IDS]);
    expect(c.find((x) => x.id === 'verdict')!.events.some((e) => e.type === 'run.failed')).toBe(true);
  });
});

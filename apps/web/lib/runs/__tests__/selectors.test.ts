import { describe, expect, it } from 'vitest';
import {
  currentLane,
  debateReason,
  evidenceUses,
  laneGroups,
  orderedClaims,
  partNumbers,
  reduceAll,
  stepsReached,
  stripEvidence,
} from '../reducer';
import { log, readLog, FIXTURE_DIR } from './load';
import path from 'node:path';

describe('case selectors', () => {
  const mixed = log('mixed');

  it('groups the three challengers as one parallel group, the rest alone', () => {
    const groups = laneGroups(reduceAll(mixed));
    expect(groups.map((g) => [g.group, g.lanes.length, g.parallel])).toEqual([
      ['intake', 1, false],
      ['sources', 1, false],
      ['parts', 1, false],
      ['challenge', 3, true],
      ['verdict', 1, false],
    ]);
  });

  it('names the latest agent to start among those working, and none when all are idle', () => {
    // After seq 19 all three challengers work; nil_supervisor started last.
    expect(currentLane(reduceAll(mixed.slice(0, 19)))?.id).toBe('nil_supervisor');
    expect(currentLane(reduceAll(mixed.slice(0, 10)))).toBeNull(); // between lanes
    expect(currentLane(reduceAll(mixed))).toBeNull();
  });

  it('counts the steps reached, never the skipped ones', () => {
    expect(stepsReached(reduceAll(mixed.slice(0, 11)))).toBe(3);
    const blocked = readLog(path.join(FIXTURE_DIR, 'blocked.jsonl'));
    expect(stepsReached(reduceAll(blocked))).toBe(1);
  });

  it('orders strips by their place in the message and numbers them from 1', () => {
    const s = reduceAll(mixed);
    expect(orderedClaims(s).map((c) => c.claim_id)).toEqual(['C1', 'C2']);
    expect(partNumbers(s)).toEqual({ C1: 1, C2: 2 });
  });

  it('ties sources to a part only through marks and the verdict', () => {
    const s = reduceAll(mixed);
    expect(stripEvidence(s, 'C2')).toEqual({ ids: ['e1'], disagree: 1 });
    // Before the challenger's mark nothing ties e1 to part 2.
    expect(stripEvidence(reduceAll(mixed.slice(0, 22)), 'C2')).toEqual({ ids: [], disagree: 0 });
    // The Judge cites e1 for part 1; the challenger's mark cites it against part 2.
    expect(evidenceUses(s, 'e1')).toEqual([
      { claimId: 'C1', part: 1, relation: 'supports' },
      { claimId: 'C2', part: 2, relation: 'contradicts' },
    ]);
    expect(evidenceUses(s, 'e9')).toEqual([]);
  });

  it('reads the second-round reason from the log', () => {
    expect(debateReason(reduceAll(mixed))).toBeNull();
    const s = reduceAll(log('second-round'));
    expect(debateReason(s)).toBe(s.debateRounds.at(-1)?.reason);
    expect(debateReason(s)).toBeTruthy();
  });
});

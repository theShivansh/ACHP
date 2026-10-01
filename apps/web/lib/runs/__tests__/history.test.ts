import { describe, expect, it } from 'vitest';
import { forgetRun, HISTORY_KEY, HISTORY_MAX, isRememberable, readHistory, rememberRun } from '../history';

function memory(initial?: string) {
  let v = initial ?? null;
  return {
    getItem: () => v,
    setItem: (_k: string, x: string) => {
      v = x;
    },
  };
}

describe('the checks of this browser', () => {
  it('remembers a run once, newest first', () => {
    const s = memory();
    rememberRun('r_aaaa', 1, s);
    rememberRun('r_bbbb', 2, s);
    rememberRun('r_aaaa', 3, s);
    expect(readHistory(s).map((e) => e.id)).toEqual(['r_bbbb', 'r_aaaa']);
  });

  it('keeps at most 50', () => {
    const s = memory();
    for (let i = 0; i < 60; i += 1) rememberRun(`r_run${String(i).padStart(3, '0')}`, i, s);
    const list = readHistory(s);
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0].id).toBe('r_run059');
  });

  it('forgets one', () => {
    const s = memory();
    rememberRun('r_aaaa', 1, s);
    rememberRun('r_bbbb', 2, s);
    expect(forgetRun('r_aaaa', s).map((e) => e.id)).toEqual(['r_bbbb']);
  });

  it('ignores damaged storage and entries that are not run ids', () => {
    expect(readHistory(memory('not json'))).toEqual([]);
    expect(readHistory(memory(JSON.stringify([{ id: '../x', at: 1 }, { id: 'r_ok00', at: 2 }, 7])))).toEqual([{ id: 'r_ok00', at: 2 }]);
  });

  it('works without storage (a private window, blocked site data)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readHistory(broken)).toEqual([]);
    expect(rememberRun('r_aaaa', 1, broken)).toEqual([]);
    expect(HISTORY_KEY).toBe('achp.runs.v1');
  });

  it('never remembers recorded examples or dev replays', () => {
    expect(isRememberable('sample-exercise-mixed')).toBe(false);
    expect(isRememberable('fixture-exercise-mixed')).toBe(false);
    expect(isRememberable('r_8f2c1a')).toBe(true);
  });
});

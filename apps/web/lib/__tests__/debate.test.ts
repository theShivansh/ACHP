import { describe, expect, it } from 'vitest';
import { challengerSentence, dominantSlant, integrityWords, significanceWords, sourceBalance, stanceWords } from '../debate';

describe('the words of the debate tab', () => {
  it('reads the stance in plain words', () => {
    expect(stanceWords('SKEWED_LEFT')).toBe('leans to the left');
    expect(stanceWords('balanced')).toBe('balanced');
    expect(stanceWords('some_new_stance')).toBe('some new stance');
  });

  it('says how much a viewpoint matters without a number', () => {
    expect(significanceWords(0.8)).toBe('matters a lot');
    expect(significanceWords(0.5)).toBe('matters somewhat');
    expect(significanceWords(0.1)).toBe('matters a little');
  });

  it('names the wording verdict and the dominant slant, never the scores', () => {
    expect(integrityWords('MILDLY_BIASED')).toBe('Mildly biased');
    expect(integrityWords('neutral')).toBe('No wording concerns');
    expect(dominantSlant('NIL verdict: misleading (score=0.47). BIS=0.52 (dominant: sensationalism). EPS=0.30.')).toBe('sensationalism');
    expect(dominantSlant('NIL verdict: biased. BIS=0.44 (dominant: academic_elitism).')).toBe('academic elitism');
    expect(dominantSlant('nothing to see')).toBeNull();
  });

  it('says what the challenger found in a sentence', () => {
    expect(challengerSentence({ held: 1, failed: 1, unsettled: 0, flaws: [] })).toBe('Tested 2 parts against the sources: 1 held up, 1 did not, 0 could not be settled.');
    expect(challengerSentence({ held: 0, failed: 0, unsettled: 1, flaws: [] })).toContain('Tested 1 part ');
    expect(challengerSentence({ held: 0, failed: 0, unsettled: 0, flaws: [] })).toContain('did not test any part');
  });

  it('counts sources for and against each part from the Judge\'s evidence lists', () => {
    expect(sourceBalance([{ claim_id: 'C1', evidence_for: ['e1', 'e2'], evidence_against: ['e3'] }, { claim_id: 'C2' }])).toEqual([
      { claimId: 'C1', part: 1, for: 2, against: 1 },
      { claimId: 'C2', part: 2, for: 0, against: 0 },
    ]);
  });
});

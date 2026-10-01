import { describe, expect, it } from 'vitest';
import { citedChunks, isOutOfLibrary, matchWords, orderedCitations, splitAnswer } from '../qa';

const citations = [
  { chunk_index: 4, score: 0.3, excerpt: 'four' },
  { chunk_index: 0, score: 0.7, excerpt: 'zero' },
  { chunk_index: 1, score: 0.5, excerpt: 'one' },
];

describe('the answer split at its markers', () => {
  it('turns [N] and [CHUNK N] into citations, in order, keeping the prose', () => {
    expect(splitAnswer('At least 150 minutes [0]. More brings benefit [CHUNK 1][4].')).toEqual([
      { kind: 'text', text: 'At least 150 minutes ' },
      { kind: 'cite', chunk: 0 },
      { kind: 'text', text: '. More brings benefit ' },
      { kind: 'cite', chunk: 1 },
      { kind: 'cite', chunk: 4 },
      { kind: 'text', text: '.' },
    ]);
  });

  it('numbers passages by first citation, once each', () => {
    expect(citedChunks('A [4]. B [0][4]. C [1].')).toEqual([4, 0, 1]);
  });
});

describe('out of library', () => {
  it('is an answer that cites nothing (the server drops sentences with no retrieved passage)', () => {
    expect(isOutOfLibrary({ answer: 'The knowledge base does not contain information about this.' })).toBe(true);
    expect(isOutOfLibrary({ answer: 'Yes [2].' })).toBe(false);
  });
});

describe('the passages shown', () => {
  it('lists the cited ones in citation order, then the rest by closeness', () => {
    const { cited, other } = orderedCitations({ answer: 'x [1]. y [4].', citations });
    expect(cited.map((c) => c.chunk_index)).toEqual([1, 4]);
    expect(other.map((c) => c.chunk_index)).toEqual([0]);
  });

  it('says similarity in words', () => {
    expect([0.9, 0.55, 0.4, 0.2].map(matchWords)).toEqual(['close match', 'close match', 'partial match', 'loose match']);
  });
});

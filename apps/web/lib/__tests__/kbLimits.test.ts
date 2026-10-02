import { describe, expect, it } from 'vitest';
import { fileProblem, KB_MAX_BYTES, textProblem, urlProblem } from '../kbLimits';

describe('library upload limits (mirrored from the backend)', () => {
  it('accepts the five types the backend reads, and says which ones it does not', () => {
    for (const n of ['a.pdf', 'b.DOCX', 'c.doc', 'd.txt', 'e.md']) expect(fileProblem({ name: n, size: 10 })).toBeNull();
    expect(fileProblem({ name: 'photo.png', size: 10 })).toMatch(/not a file a library can read/);
    expect(fileProblem({ name: 'noext', size: 10 })).toMatch(/not a file/);
  });
  it('refuses a file over 50 MB or an empty one', () => {
    expect(fileProblem({ name: 'big.pdf', size: KB_MAX_BYTES + 1 })).toMatch(/larger than 50 MB/);
    expect(fileProblem({ name: 'big.pdf', size: KB_MAX_BYTES })).toBeNull();
    expect(fileProblem({ name: 'e.txt', size: 0 })).toMatch(/empty/);
  });
  it('wants a full http(s) address and at least 10 characters of text', () => {
    expect(urlProblem('example.com')).toMatch(/starts with http/);
    expect(urlProblem('https://example.com/a')).toBeNull();
    expect(textProblem('too short')).toMatch(/at least 10/);
    expect(textProblem('long enough text')).toBeNull();
  });
});

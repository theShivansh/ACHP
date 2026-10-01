import { describe, expect, it } from 'vitest';
import { METRICS, OVERALL } from '../method';

// Every score is spelled out before its acronym is used (the metric vocabulary rule): reading the five definitions in
// order, an acronym never appears before the line that names it in full.

const FULL: Record<string, string> = {
  CTS: 'Consensus Truth Score',
  PCS: 'Perspective Completeness Score',
  BIS: 'Bias Impact Score',
  NSS: 'Narrative Stance Score',
  EPS: 'Epistemic Position Score',
};

describe('the method definitions', () => {
  it('spell a score out before any acronym of it is used', () => {
    const text = [...METRICS.map((m) => `${m.name} (${m.acronym}) ${m.means} ${m.formula}`), OVERALL.formula].join('\n');
    for (const [acronym, full] of Object.entries(FULL)) {
      const fullAt = text.indexOf(full);
      const acronymAt = text.search(new RegExp(`\\b${acronym}\\b`));
      expect(fullAt, full).toBeGreaterThanOrEqual(0);
      expect(fullAt, `${full} before ${acronym}`).toBeLessThan(acronymAt);
    }
  });
});

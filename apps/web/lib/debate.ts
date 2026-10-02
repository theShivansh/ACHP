import type { FindingsRecorded } from '@/lib/runs/types';

// Words for the debate tab (04 section 9: plain, specific, calm). The tab shows what each reviewer concluded, never how
// it got there (non-negotiable 2), and never a bare percentage or an acronym without its words (non-negotiable 9).

const STANCES: Record<string, string> = {
  balanced: 'balanced',
  skewed_left: 'leans to the left',
  skewed_right: 'leans to the right',
  skewed: 'leans to one side',
  corporate: 'speaks for business interests',
  populist: 'speaks for "the people" against an elite',
  one_sided: 'one-sided',
  unknown: 'not read',
};

export function stanceWords(stance: string): string {
  const key = stance.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STANCES[key] ?? key.replace(/_/g, ' ');
}

/** How much a missing viewpoint matters, in words (the number stays out of the Sharer view). */
export function significanceWords(significance: number): string {
  if (significance >= 0.7) return 'matters a lot';
  if (significance >= 0.4) return 'matters somewhat';
  return 'matters a little';
}

const INTEGRITY: Record<string, string> = {
  misleading: 'Misleading',
  biased: 'Biased',
  mildly_biased: 'Mildly biased',
  neutral: 'No wording concerns',
  balanced: 'No wording concerns',
  clean: 'No wording concerns',
  unknown: 'Not read',
};

export function integrityWords(verdict: string): string {
  const key = verdict.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return INTEGRITY[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** The dominant slant named in the check's summary ("... (dominant: sensationalism) ..."), without its scores. */
export function dominantSlant(summary: string): string | null {
  const m = /dominant:\s*([a-z_ -]+?)\)/i.exec(summary);
  return m ? m[1].trim().replace(/_/g, ' ').toLowerCase() : null;
}

/** "Tested 2 parts against the sources: 1 held up, 1 did not, 0 could not be settled." */
export function challengerSentence(c: FindingsRecorded['challenger']): string {
  const n = c.held + c.failed + c.unsettled;
  if (n === 0) return 'It did not test any part against the sources.';
  const part = n === 1 ? 'part' : 'parts';
  return `Tested ${n} ${part} against the sources: ${c.held} held up, ${c.failed} did not, ${c.unsettled} could not be settled.`;
}

/** Per part: how many sources back it and how many speak against it, from the Judge's own evidence lists. */
export function sourceBalance(claims: { claim_id: string; evidence_for?: string[]; evidence_against?: string[] }[]) {
  return claims.map((c, i) => ({
    claimId: c.claim_id,
    part: i + 1,
    for: c.evidence_for?.length ?? 0,
    against: c.evidence_against?.length ?? 0,
  }));
}

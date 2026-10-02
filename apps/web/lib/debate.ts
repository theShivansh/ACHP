import { evidenceUses, orderedClaims, type RunState } from '@/lib/runs/reducer';
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
  const slant = m ? m[1].trim().replace(/_/g, ' ').toLowerCase() : null;
  return slant && slant !== 'none' ? slant : null;
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

// ── What was searched, what came back, and what each reviewer said ───────────────────────────────────────────────────
// All of it is already in the run's log (actions, pinned sources, one-line notes). Nothing here is a reasoning trace:
// a note is the sentence an agent chose to publish (validated, at most 140 characters), a source is a verbatim excerpt.

export interface DebateSource {
  id: string;
  n: number;
  domain: string;
  title: string;
  quote: string;
  /** "Supports part 1", "Contradicts part 2"; empty when no part cites it. */
  uses: string[];
}

export interface DebateView {
  /** What the retriever searched for, as logged ("Searching the web: rcb is better than csk and kkr"). */
  searches: { label: string; detail: string | null }[];
  /** The retriever's own summary ("Pinned 5 sources: 5 from the web", "Found no sources for this claim"). */
  retrieved: string | null;
  sources: DebateSource[];
  /** The last sentence each reviewer published. */
  notes: { challenger: string | null; auditor: string | null; integrity: string | null; judge: string | null };
  /** Why part of the message was not settled, from the log; null when every part was ruled on. */
  whyUnsettled: string | null;
}

const USE_WORDS: Record<string, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  missing_context: 'Adds context to',
  framing: 'Frames',
  unclear: 'Touches',
};

function lastNote(state: RunState, lane: string): string | null {
  const notes = state.lanes[lane]?.notes ?? [];
  return notes.length ? notes[notes.length - 1].text : null;
}

export function debateView(state: RunState): DebateView {
  const searches = state.events.flatMap((e) =>
    e.type === 'agent.action' && e.agent === 'retriever' && (e.data.action === 'search_web' || e.data.action === 'search_kb')
      ? [{ label: e.data.label, detail: e.data.detail ?? null }]
      : [],
  );
  const cards = state.evidenceOrder.map((id) => state.evidence[id]).filter(Boolean);
  const sources: DebateSource[] = cards.map((c, i) => ({
    id: c.evidence_id,
    n: i + 1,
    domain: c.source.domain ?? '',
    title: c.source.title ?? '',
    quote: c.quote,
    uses: evidenceUses(state, c.evidence_id).map((u) => `${USE_WORDS[u.relation] ?? 'Touches'} part ${u.part}`),
  }));

  const unsettled = orderedClaims(state).filter(
    (c) => state.verdict?.claims.find((v) => v.claim_id === c.claim_id)?.label === 'unverifiable',
  );
  let whyUnsettled: string | null = null;
  if (unsettled.length) {
    const cited = sources.filter((s) => s.uses.length).length;
    if (sources.length === 0) {
      whyUnsettled = `${state.lanes.retriever?.summary ?? 'No sources were found'}, so there was nothing to settle it against.`;
    } else if (cited === 0) {
      whyUnsettled =
        `The search found ${sources.length} ${sources.length === 1 ? 'source' : 'sources'} (listed above), but none was cited for ` +
        'or against the message, so the Judge could not rule on it from them.';
    } else {
      whyUnsettled = `${cited} of the ${sources.length} sources were cited for other parts; none settled the part marked Not settled.`;
    }
  }

  return {
    searches,
    retrieved: state.lanes.retriever?.summary ?? null,
    sources,
    notes: {
      challenger: lastNote(state, 'adversary_a'),
      auditor: lastNote(state, 'adversary_b'),
      integrity: lastNote(state, 'nil_supervisor'),
      judge: lastNote(state, 'judge'),
    },
    whyUnsettled,
  };
}

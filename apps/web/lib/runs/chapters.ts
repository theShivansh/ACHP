// The replay story's chapters (05 §2, 07 §2): a pure function from a run's event log to seven chapters,
// in a fixed order, each with its events and a one-sentence caption taken from the log itself (public notes,
// agent summaries, a skip reason, the verdict summary). Nothing here is written for the story: a caption
// that would need invented words is left to the event that carries them.
//
// Friction gates (05 §2.3): at most two, and only for the two allowed triggers, the first contradiction and
// the first missing-context finding. A gate belongs to the chapter that holds its mark; both triggers
// normally land in "Challenge", so a chapter can carry up to two gates.

import type { AgentInfo, Relation, RunEvent, Span } from './types';

export const CHAPTER_IDS = ['claim', 'gatekeeper', 'sources', 'parts', 'challenge', 'framing', 'verdict'] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** The rail's labels (07 §2). */
export const CHAPTER_TITLES: Record<ChapterId, string> = {
  claim: 'Claim',
  gatekeeper: 'Gatekeeper',
  sources: 'Sources',
  parts: 'Parts',
  challenge: 'Challenge',
  framing: 'Framing',
  verdict: 'Verdict',
};

export type GateKind = 'contradiction' | 'missing_context';

export interface Gate {
  kind: GateKind;
  /** seq of the claim.marked event that opened the gate. */
  seq: number;
  claimId: string;
  agent: string | null;
  span: Span;
  /** Evidence the mark cites (the quoted counter-evidence, for a contradiction). */
  evidenceIds: string[];
  /** One sentence of interpretation: the mark's own note, else the agent's public note that followed it. */
  note: string | null;
}

export interface Chapter {
  id: ChapterId;
  title: string;
  events: RunEvent[];
  /** One sentence from the log. Empty only if the log has nothing to say for this chapter. */
  caption: string;
  /** True when the agents of this chapter never ran (a blocked run). */
  skipped: boolean;
  gate: boolean;
  gates: Gate[];
}

// Structural, not identity: which chapter an agent's work belongs to. An id the map doesn't know falls
// back to its `group` in run.started.agents[] (an agent added later still lands somewhere sensible).
const AGENT_CHAPTER: Record<string, ChapterId> = {
  security_validator: 'gatekeeper',
  retriever: 'sources',
  proposer: 'parts',
  adversary_a: 'challenge',
  adversary_b: 'challenge',
  nil_supervisor: 'framing',
  judge: 'verdict',
};
const GROUP_CHAPTER: Record<string, ChapterId> = {
  intake: 'gatekeeper',
  sources: 'sources',
  parts: 'parts',
  challenge: 'challenge',
  verdict: 'verdict',
};

const GATE_TRIGGER: Partial<Record<Relation, GateKind>> = {
  contradicts: 'contradiction',
  missing_context: 'missing_context',
};

function chapterOfAgent(agent: string | null, groups: Map<string, string>): ChapterId | null {
  if (!agent) return null;
  if (AGENT_CHAPTER[agent]) return AGENT_CHAPTER[agent];
  const g = groups.get(agent);
  return (g && GROUP_CHAPTER[g]) || null;
}

function chapterOf(e: RunEvent, groups: Map<string, string>): ChapterId {
  switch (e.type) {
    case 'run.queued':
    case 'run.started':
      return 'claim';
    case 'evidence.found':
    case 'evidence.verified':
      return 'sources';
    case 'claim.extracted':
      return 'parts';
    case 'signal.computed':
      return 'framing';
    case 'debate.round':
    case 'claim.marked':
      return chapterOfAgent(e.agent, groups) ?? 'challenge';
    case 'verdict.final':
    case 'assay.computed':
    case 'run.completed':
    case 'run.failed':
      return 'verdict';
    default:
      // agent.started / action / note / done / skipped / failed
      return chapterOfAgent(e.agent, groups) ?? 'claim';
  }
}

function sentence(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
}

function excerpt(text: string, limit: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > limit * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/** What the chapter's agents said about their own work: done summaries, else skip reasons, else notes. */
function agentLines(events: RunEvent[]): { done: string[]; skipped: string[]; notes: string[] } {
  const out = { done: [] as string[], skipped: [] as string[], notes: [] as string[] };
  for (const e of events) {
    if (e.type === 'agent.done' && e.data.summary) out.done.push(e.data.summary);
    else if (e.type === 'agent.skipped' && e.data.reason) out.skipped.push(e.data.reason);
    else if (e.type === 'agent.note' && e.data.note) out.notes.push(e.data.note);
  }
  return out;
}

function caption(id: ChapterId, events: RunEvent[]): { text: string; skipped: boolean } {
  const started = events.find((e) => e.type === 'run.started');
  if (id === 'claim') {
    return { text: started?.type === 'run.started' ? sentence(`“${excerpt(started.data.input.text, 140)}”`) : '', skipped: false };
  }
  if (id === 'verdict') {
    const v = events.find((e) => e.type === 'verdict.final');
    if (v?.type === 'verdict.final') return { text: sentence(v.data.overall.summary), skipped: false };
    const failed = events.find((e) => e.type === 'run.failed');
    if (failed?.type === 'run.failed') return { text: sentence(failed.data.message), skipped: false };
  }
  const lines = agentLines(events);
  if (lines.done.length) return { text: sentence(lines.done.join(' · ')), skipped: false };
  if (lines.skipped.length) return { text: sentence([...new Set(lines.skipped)].join(' · ')), skipped: true };
  if (lines.notes.length) return { text: sentence(lines.notes[0]), skipped: false };
  return { text: '', skipped: false };
}

/** The gates of a log: the first contradiction and the first missing-context mark, at most two. */
function findGates(events: RunEvent[], chapterOfSeq: Map<number, ChapterId>): Map<ChapterId, Gate[]> {
  const found = new Map<GateKind, Gate>();
  for (const e of events) {
    if (e.type !== 'claim.marked') continue;
    const kind = GATE_TRIGGER[e.data.relation];
    if (!kind || found.has(kind)) continue;
    const agentNote = events.find((n) => n.type === 'agent.note' && n.agent === e.agent && n.seq >= e.seq);
    found.set(kind, {
      kind,
      seq: e.seq,
      claimId: e.data.claim_id,
      agent: e.agent,
      span: e.data.span,
      evidenceIds: e.data.evidence_ids ?? [],
      note: e.data.note ?? (agentNote?.type === 'agent.note' ? agentNote.data.note : null),
    });
  }
  const byChapter = new Map<ChapterId, Gate[]>();
  for (const g of [...found.values()].sort((a, b) => a.seq - b.seq)) {
    const id = chapterOfSeq.get(g.seq) ?? 'challenge';
    byChapter.set(id, [...(byChapter.get(id) ?? []), g]);
  }
  return byChapter;
}

/** Seven chapters, always, in order. A chapter with no events has no caption and isn't a gate. */
export function buildChapters(events: RunEvent[]): Chapter[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const started = sorted.find((e) => e.type === 'run.started');
  const agents: AgentInfo[] = started?.type === 'run.started' ? started.data.agents : [];
  const groups = new Map(agents.map((a) => [a.id, a.group]));

  const byId = new Map<ChapterId, RunEvent[]>(CHAPTER_IDS.map((id) => [id, []]));
  const chapterOfSeq = new Map<number, ChapterId>();
  for (const e of sorted) {
    const id = chapterOf(e, groups);
    byId.get(id)!.push(e);
    chapterOfSeq.set(e.seq, id);
  }
  const gates = findGates(sorted, chapterOfSeq);

  return CHAPTER_IDS.map((id) => {
    const evs = byId.get(id)!;
    const { text, skipped } = caption(id, evs);
    const g = gates.get(id) ?? [];
    return { id, title: CHAPTER_TITLES[id], events: evs, caption: text, skipped, gate: g.length > 0, gates: g };
  });
}

/** Total friction gates in a story (never more than two). */
export function gateCount(chapters: Chapter[]): number {
  return chapters.reduce((n, c) => n + c.gates.length, 0);
}

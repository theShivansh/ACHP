import type { ComponentType } from 'react';
import {
  CropGlyph,
  DotGlyph,
  HighlighterGlyph,
  LoupeGlyph,
  PaperclipGlyph,
  BluePencilGlyph,
  RedPencilGlyph,
  ScissorsGlyph,
  SealGlyph,
  StampGlyph,
  type GlyphProps,
} from '@/components/glyphs';

// Visual identity only (04 §6). Which agents run, their models and parallel groups arrive at
// runtime in `run.started.agents[]` (06 §2); nothing here names a model or decides a lane order.

/** The mark each agent leaves on the sheet. */
export type MarkKind =
  | 'seal' // bracket seal around the claim
  | 'clip' // paperclip on an evidence card
  | 'cut' // scissors: the claim cut into strips
  | 'red-pencil' // strike, underline, "?"
  | 'blue-pencil' // brackets, carets, "missing: …"
  | 'highlight' // highlighter over loaded words + tally marks
  | 'stamp' // rubber stamp per strip + overall
  | 'check' // ✓ or ✗ on each paperclip
  | 'crop' // crop marks on images
  | 'none';

/**
 * The ink an agent writes in, as a token name (never a hex value).
 * `verdict` means the ink follows the verdict color (the Judge's stamps).
 */
export type Ink = 'ink' | 'graphite' | 'pencil-red' | 'pencil-blue' | 'ochre' | 'support' | 'verdict';

export interface AgentIdentity {
  displayName: string;
  ink: Ink;
  glyph: ComponentType<GlyphProps>;
  markKind: MarkKind;
}

export const agentIdentities = {
  security_validator: { displayName: 'Gatekeeper', ink: 'graphite', glyph: SealGlyph, markKind: 'seal' },
  retriever: { displayName: 'Clipper', ink: 'graphite', glyph: PaperclipGlyph, markKind: 'clip' },
  proposer: { displayName: 'Decomposer', ink: 'ink', glyph: ScissorsGlyph, markKind: 'cut' },
  adversary_a: { displayName: 'Fact Challenger', ink: 'pencil-red', glyph: RedPencilGlyph, markKind: 'red-pencil' },
  adversary_b: { displayName: 'Narrative Auditor', ink: 'pencil-blue', glyph: BluePencilGlyph, markKind: 'blue-pencil' },
  nil_supervisor: { displayName: 'Framing Lens', ink: 'ochre', glyph: HighlighterGlyph, markKind: 'highlight' },
  judge: { displayName: 'Judge', ink: 'verdict', glyph: StampGlyph, markKind: 'stamp' },
  // Future agents (not emitted by the server yet)
  evidence_verifier: { displayName: 'Verifier', ink: 'support', glyph: LoupeGlyph, markKind: 'check' },
  media_integrity: { displayName: 'Media Desk', ink: 'graphite', glyph: CropGlyph, markKind: 'crop' },
} as const satisfies Record<string, AgentIdentity>;

export type KnownAgentId = keyof typeof agentIdentities;

export function isKnownAgentId(id: string): id is KnownAgentId {
  return Object.hasOwn(agentIdentities, id);
}

/**
 * The look for a server agent. An id the registry doesn't know still gets a lane: it keeps the
 * name the server sent (`run.started.agents[].name`) with a neutral glyph and no marks.
 */
export function agentIdentity(id: string, serverName?: string): AgentIdentity {
  if (isKnownAgentId(id)) return agentIdentities[id];
  return { displayName: serverName ?? id, ink: 'graphite', glyph: DotGlyph, markKind: 'none' };
}

/** Tailwind text-color class for an ink; `verdict` resolves to the verdict color by the caller. */
export const inkTextClass: Record<Exclude<Ink, 'verdict'>, string> = {
  ink: 'text-ink',
  graphite: 'text-graphite',
  'pencil-red': 'text-pencil-red',
  'pencil-blue': 'text-pencil-blue',
  ochre: 'text-ochre',
  support: 'text-support',
};

/**
 * The same inks on the desk (04 §3.2 desk accents): the sheet inks fail AA on the dark desk.
 * The Judge's `verdict` ink has no verdict yet while it works, so its lane glyph is plain desk ink.
 */
export const deskInkClass: Record<Ink, string> = {
  ink: 'text-desk-ink',
  graphite: 'text-desk-graphite',
  'pencil-red': 'text-desk-red',
  'pencil-blue': 'text-desk-blue',
  ochre: 'text-desk-ochre',
  support: 'text-desk-support',
  verdict: 'text-desk-ink',
};

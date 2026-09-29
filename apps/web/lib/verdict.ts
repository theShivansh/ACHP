// Verdict vocabulary (04 §3.3): the one place a server label becomes words, a color token, a stamp
// text and a mark. Components ask here; nothing else spells "Contradicted" or picks its color.

import type { Label } from '@/lib/runs/types';

export type VerdictTone = 'support' | 'red' | 'ochre' | 'graphite';
export type MarkStyle = 'tick' | 'strike' | 'half-underline' | 'bracket-caret' | 'dashed-box' | 'none';

export interface VerdictInfo {
  label: Label;
  /** Sentence-case name for chips and prose ("Missing context"). */
  name: string;
  /** Stamp text: the one place uppercase is allowed (04 §3.3). */
  stamp: string;
  tone: VerdictTone;
  /** Tailwind classes that resolve on paper (`.paper`), keyed by use. */
  text: string;
  border: string;
  mark: MarkStyle;
  /** For screen readers and share text ("not settled by the sources"). */
  words: string;
}

export const VERDICTS: Record<Label, VerdictInfo> = {
  supported: {
    label: 'supported',
    name: 'Supported',
    stamp: 'SUPPORTED',
    tone: 'support',
    text: 'text-support',
    border: 'border-support',
    mark: 'tick',
    words: 'supported by the sources',
  },
  contradicted: {
    label: 'contradicted',
    name: 'Contradicted',
    stamp: 'CONTRADICTED',
    tone: 'red',
    text: 'text-pencil-red',
    border: 'border-pencil-red',
    mark: 'strike',
    words: 'contradicted by the sources',
  },
  mixed: {
    label: 'mixed',
    name: 'Mixed',
    stamp: 'MIXED',
    tone: 'ochre',
    text: 'text-ochre',
    border: 'border-ochre',
    mark: 'half-underline',
    words: 'partly supported and partly not',
  },
  missing_context: {
    label: 'missing_context',
    name: 'Missing context',
    stamp: 'MISSING CONTEXT',
    tone: 'ochre',
    text: 'text-ochre',
    border: 'border-ochre',
    mark: 'bracket-caret',
    words: 'true as far as it goes, but leaves out context',
  },
  // Never red: "we couldn't settle it" isn't "it's wrong" (04 §3.3).
  unverifiable: {
    label: 'unverifiable',
    name: 'Not settled',
    stamp: 'UNVERIFIABLE',
    tone: 'graphite',
    text: 'text-graphite',
    border: 'border-graphite',
    mark: 'dashed-box',
    words: 'not settled by the sources',
  },
  blocked: {
    label: 'blocked',
    name: 'Not checked',
    stamp: 'NOT CHECKED',
    tone: 'graphite',
    text: 'text-graphite',
    border: 'border-graphite',
    mark: 'none',
    words: 'not checked',
  },
};

/** Legacy pipeline verdicts (`/analyze` before v2) mapped explicitly; nothing is guessed. */
const LEGACY: Record<string, Label> = {
  TRUE: 'supported',
  MOSTLY_TRUE: 'supported',
  MIXED: 'mixed',
  MOSTLY_FALSE: 'contradicted',
  FALSE: 'contradicted',
  UNVERIFIABLE: 'unverifiable',
  BLOCKED: 'blocked',
};

export function isLabel(v: string): v is Label {
  return Object.hasOwn(VERDICTS, v);
}

/** The display info for a server label or a legacy verdict; null for anything else. */
export function verdictInfo(value: string | null | undefined): VerdictInfo | null {
  if (!value) return null;
  if (isLabel(value)) return VERDICTS[value];
  const legacy = LEGACY[value.toUpperCase()];
  if (legacy) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`verdict: legacy verdict "${value}" mapped to "${legacy}"`);
    }
    return VERDICTS[legacy];
  }
  return null;
}

export const BANDS = {
  strong: { name: 'Strong evidence', segments: 3 },
  moderate: { name: 'Moderate evidence', segments: 2 },
  weak: { name: 'Weak evidence', segments: 1 },
} as const;

export type BandKey = keyof typeof BANDS;

/** A stamp's tilt in degrees, −3…+3, the same for the same id every time (04 §7). */
export function seededTilt(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 10001) / 10000; // 0..1
  return Math.round((unit * 6 - 3) * 10) / 10;
}

/** A claim excerpt for titles and share text: whole words, an ellipsis only when something was cut. */
export function excerpt(text: string, limit: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > limit * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

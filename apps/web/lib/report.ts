// Pure helpers for the completed report: the share text and the reading-level check on the
// plain-words summary. No React, no clock, no network.

import { verdictInfo } from '@/lib/verdict';
import type { VerdictFinal } from '@/lib/runs/types';

export const SHARE_MAX = 400;

function clip(text: string, limit: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > limit * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/**
 * "Copy summary": the verdict, the claim's excerpt, the one-line reason and the link, at most
 * SHARE_MAX characters. The link is never cut; the excerpt and reason give way first.
 */
export function shareSummary(opts: { claim: string; verdict: VerdictFinal; url: string }): string {
  const { claim, verdict, url } = opts;
  const info = verdictInfo(verdict.overall.label);
  const head = info ? `ACHP: ${info.name}.` : 'ACHP check.';
  const tail = `\n${url}`;
  let excerpt = `“${clip(claim, 90)}”`;
  let reason = verdict.overall.summary.replace(/\s+/g, ' ').trim();
  const build = () => `${head} ${excerpt}\n${reason}${tail}`;
  let out = build();
  if (out.length > SHARE_MAX) {
    const room = SHARE_MAX - (build().length - reason.length);
    reason = clip(reason, Math.max(40, room));
    out = build();
  }
  if (out.length > SHARE_MAX) {
    excerpt = `“${clip(claim, 40)}”`;
    out = build();
  }
  return out;
}

// ── Reading level (Flesch–Kincaid grade) ─────────────────────────────────────

/** Vowel-group syllable estimate: good enough for a ceiling check on plain English. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function fleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => /\w/.test(s));
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (!sentences.length || !words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
}

/** The summary is for a non-expert: at most two sentences and about a 9th-grade reading level. */
export const SUMMARY_MAX_GRADE = 9;
export const SUMMARY_MAX_SENTENCES = 2;

export function sentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s|$)/).filter((s) => /\w/.test(s)).length;
}

import type { AssayComputed } from '@/lib/runs/types';

// What a "Not settled" stamp can still say (07 §4, 11 §4). The stamp stays Not settled: with no source behind it, calling
// the message true or false would be a verdict nobody checked. What can be said honestly is built only from what the run
// already logged: whether each part is a checkable statement or an opinion (the Proposer's `verifiable`), how many
// sources were found, and, when the run has an Assay, how the message is worded and how many viewpoints it covers. No
// number and no verdict word from the formula is shown: the formula scores wording, so a calm sentence with nothing behind
// it (even gibberish) can score "mostly true", and the overall score never stands alone.

export interface NotSettledReading {
  /** The one line that matters: unsettled is not false. */
  lead: string;
  /** Why nothing settled it. */
  why: string;
  /** What the search came back with, by page title (verbatim), or null when it found nothing. */
  found: string | null;
  /** The sentence each reviewer published about its own work. */
  reviewers: { who: string; said: string }[];
  /** What the Assay says about how the message is written, or null when the run has no Assay. */
  scores: string | null;
  /** What would settle it. */
  next: string;
}

function sourceClause(sources: number): string {
  if (sources === 0) return 'We found no source that decides it.';
  return `We found ${sources} source${sources === 1 ? '' : 's'}, but none decides it.`;
}

function biasWords(bis: number): string {
  if (bis < 0.2) return 'calm wording';
  if (bis < 0.45) return 'somewhat slanted wording';
  return 'strongly slanted wording';
}

function viewpointWords(pcs: number): string {
  return pcs < 0.5 ? 'other viewpoints left out' : 'several viewpoints covered';
}

function clip(text: string, n = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

function foundSentence(titles: readonly string[]): string | null {
  const t = titles.map((x) => clip(x)).filter(Boolean).slice(0, 3);
  if (!t.length) return null;
  const quoted = t.map((x) => `“${x}”`);
  const list = quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
  return `The search turned up pages such as ${list}.`;
}

export function notSettledReading({
  verifiable,
  sources,
  assay,
  titles = [],
  reviewers = [],
}: {
  /** Per part: is it a statement a source could settle? */
  verifiable: readonly boolean[];
  sources: number;
  assay: AssayComputed | null;
  /** The titles of the pinned sources, in order. */
  titles?: readonly string[];
  /** The sentence each reviewer published (name from the run). Empty or missing notes are skipped. */
  reviewers?: readonly { who: string; said: string | null }[];
}): NotSettledReading {
  const opinions = verifiable.filter((v) => !v).length;
  const allOpinion = verifiable.length > 0 && opinions === verifiable.length;

  let why: string;
  if (allOpinion) {
    why = 'This reads as an opinion or a preference, so no source could settle it. It is not a statement we can call true or false.';
  } else if (opinions > 0) {
    why = `Part of it is an opinion or a preference, which no source could settle. For the rest: ${sourceClause(sources).replace(/^We/, 'we')}`;
  } else {
    why = sourceClause(sources);
  }

  // The Assay describes how the message is written and which viewpoints it covers. It never leans the message true or
  // false here: calm wording lifts the formula's overall score even for gibberish, so its verdict word would mislead.
  let scores: string | null = null;
  if (assay && assay.formula_verdict !== 'BLOCKED') {
    scores =
      `Reading the message itself: ${biasWords(assay.metrics.BIS)}, ${viewpointWords(assay.metrics.PCS)}. ` +
      'Those describe how it is written, not whether it is true, so they do not change the stamp.';
  }

  const next = allOpinion
    ? 'To get something checkable, say what you mean exactly: what is being compared, by which measure, and from which source.'
    : 'To settle it, say exactly what, where and when, or add a library with a source you trust and ask again.';

  return {
    lead: 'Not settled is not the same as false.',
    why,
    found: foundSentence(titles),
    reviewers: reviewers.flatMap((r) => (r.said ? [{ who: r.who, said: r.said }] : [])),
    scores,
    next,
  };
}

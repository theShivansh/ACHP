// What the Method drawer says (P4). The formulas are transcribed from the docstrings of
// apps/api/achp/core/core_pipeline.py at the lines cited, and the confidence band from
// apps/api/achp/events/confidence.py. Nothing here computes a metric: metric math lives only in
// the Assay module (P5), and the case page shows the server's values. Benchmark numbers are never
// written here; they are read from EVALUATION.md once that file exists (audit 01 G5).

export interface MetricDoc {
  acronym: string;
  name: string;
  /** Plain-words definition. */
  means: string;
  formula: string;
  source: string;
  note?: string;
}

export const METRICS: readonly MetricDoc[] = [
  {
    acronym: 'CTS',
    name: 'Consensus Truth Score',
    means: 'How well the facts in the message hold up against the sources found.',
    formula: 'CTS = 0.40·factual score (Fact Challenger) + 0.35·Judge CTS + 0.15·(1 − BIS) + 0.10·EPS',
    source: 'apps/api/achp/core/core_pipeline.py:117-129',
  },
  {
    acronym: 'PCS',
    name: 'Perspective Completeness Score',
    means: 'How many of the viewpoints a reader would need are present, not left out.',
    formula: 'PCS = 0.50·PCS (Narrative Auditor) + 0.30·PCS (Framing Lens) + 0.20·(1 − min(missing perspectives ÷ 10, 1))',
    source: 'apps/api/achp/core/core_pipeline.py:132-143',
  },
  {
    acronym: 'BIS',
    name: 'Bias Impact Score',
    means: 'How strongly the wording pushes the reader.',
    formula: 'BIS = 0.55·bias score + 0.25·framing score + 0.12·|sentiment| + a boost for alarm, delegitimizing or conspiracy framing',
    source: 'apps/api/achp/core/core_pipeline.py:146-160',
    note: 'lower is better',
  },
  {
    acronym: 'NSS',
    name: 'Narrative Stance Score',
    means: 'How balanced the story the message tells is.',
    formula: 'NSS = 0.40·(1 − framing score) + 0.35·narrative alignment + 0.25·Judge NSS',
    source: 'apps/api/achp/core/core_pipeline.py:163-173',
  },
  {
    acronym: 'EPS',
    name: 'Epistemic Position Score',
    means: 'How carefully the message states what it knows: calm certainty, hedged, or overclaiming.',
    formula: 'EPS = 0.70·sentiment position + 0.20·(1 − framing score) + 0.10·min(hedging × 3, 1)',
    source: 'apps/api/achp/core/core_pipeline.py:176-186',
  },
];

export const OVERALL = {
  name: 'overall score',
  formula: 'overall = (CTS + PCS + (1 − BIS) + NSS + EPS) ÷ 5',
  source: 'apps/api/achp/core/core_pipeline.py:189-191',
  caution:
    "The verdict stamp is the Judge's call, made from the sources. The overall score can be lifted by calm wording even when the facts do not hold up, so it is never the headline and never replaces the stamp.",
};

export const CONFIDENCE_RULES: readonly string[] = [
  'A part nobody could settle, or a message that was not checked, is Weak evidence.',
  'Sources that point both ways make a part Weak evidence.',
  'Two or more sources for the label, with the Fact Challenger reaching the same finding, make it Strong evidence.',
  'Two or more sources, or one source the Fact Challenger agrees with, make it Moderate evidence.',
  'Anything else is Weak evidence.',
  "The whole case takes its weakest rated part, one step lower when the Judge's own confidence is below one half.",
];
export const CONFIDENCE_SOURCE = 'apps/api/achp/events/confidence.py';

export const LIMITATIONS: readonly string[] = [
  'ACHP checks a message against the sources it can find on the web and in your library. A claim with no findable source comes back "not settled", which is not the same as false.',
  'The agents are language models. Their notes are checked by the server before you see them, and every quote is a verbatim excerpt of a stored source.',
  "Scores describe the wording and the evidence found. They are not a measure of the author's intent.",
];

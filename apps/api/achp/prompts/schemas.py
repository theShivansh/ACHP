"""
Output contracts for every ACHP LLM call.

These pydantic models are sent to Groq as strict `json_schema` response formats and used again to
validate the reply. Facts are referenced by evidence id only: free-text fields describe, they don't
carry new sources, URLs or statistics. Server code (achp.evidence.grounding) drops anything that
points outside the run's evidence pack.

Avoid field names `type`, `properties` and `default` (they collide with JSON-Schema keywords in the
strict-schema converter).
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

EvidenceId = str  # "e1", "e2", … (assigned by the server)
Note = Field(max_length=200, description="One plain sentence, at most 140 characters, for a non-expert.")


# ── Proposer ─────────────────────────────────────────────────────────────────

class ProposedClaim(BaseModel):
    claim_id: str = Field(description="C1, C2, … in the order the parts appear in the claim.")
    text: str = Field(max_length=400, description="The part of the claim, copied from the claim text where possible.")
    verifiable: bool = Field(description="True if evidence could, in principle, confirm or refute it.")
    confidence: float = Field(ge=0.0, le=1.0, description="How clearly this is a single checkable statement.")
    epistemic_marker: Literal["claims", "states", "argues", "suggests", "shows", "predicts"]
    evidence_ids: List[EvidenceId] = Field(description="Evidence items that discuss this part. Empty if none.")


class ProposerOutput(BaseModel):
    claims: List[ProposedClaim] = Field(max_length=8)
    claim_type: Literal["factual", "opinion", "prediction", "mixed"]
    overall_confidence: float = Field(ge=0.0, le=1.0)
    context_summary: str = Field(max_length=240, description="One sentence: what the message asserts.")


# ── Analysis bundle: Adversary A + Adversary B + NIL language signals ────────

Relation = Literal["contradicts", "supports", "missing_context", "framing", "unclear"]


class Flaw(BaseModel):
    claim_id: str
    quote: str = Field(max_length=300, description="Verbatim span of that part's text the finding applies to.")
    relation: Relation
    evidence_ids: List[EvidenceId]
    severity: int = Field(ge=1, le=3)


class ChallengeOut(BaseModel):
    claim_id: str
    verdict: Literal["supported", "contested", "refuted", "unverifiable"]
    confidence: float = Field(ge=0.0, le=1.0)
    supporting_evidence_ids: List[EvidenceId]
    counter_evidence_ids: List[EvidenceId]
    missing_evidence: List[str] = Field(max_length=4, description="What evidence would settle it (not facts).")
    logical_fallacies: List[str] = Field(max_length=4)
    epistemic_flags: List[str] = Field(max_length=4)


class CriticalFlaw(BaseModel):
    kind: Literal["contradicted_by_evidence", "unsupported", "logical", "outdated"]
    text: str = Field(max_length=200)
    evidence_ids: List[EvidenceId] = Field(description="Required for contradicted_by_evidence and outdated.")


class FactChallengeOut(BaseModel):
    challenges: List[ChallengeOut]
    overall_factual_score: float = Field(ge=0.0, le=1.0, description="0 = refuted by the evidence, 1 = fully supported.")
    critical_flaws: List[CriticalFlaw] = Field(max_length=5)
    flaws: List[Flaw] = Field(max_length=8)
    public_note: str = Note


class MissingPerspectiveOut(BaseModel):
    stakeholder: str = Field(max_length=80)
    viewpoint: str = Field(max_length=240)
    why_missing: str = Field(max_length=200)
    significance: float = Field(ge=0.0, le=1.0)
    evidence_ids: List[EvidenceId]


class NarrativeAuditOut(BaseModel):
    missing_perspectives: List[MissingPerspectiveOut] = Field(max_length=6)
    represented_stakeholders: List[str] = Field(max_length=8)
    framing_asymmetries: List[str] = Field(max_length=5)
    silenced_voices: List[str] = Field(max_length=5)
    perspective_completeness_score: float = Field(ge=0.0, le=1.0)
    narrative_stance: Literal["balanced", "skewed_left", "skewed_right", "corporate", "populist", "one_sided"]
    flaws: List[Flaw] = Field(max_length=6)
    public_note: str = Note


class BiasAxes(BaseModel):
    political_left: float = Field(ge=0.0, le=1.0)
    political_right: float = Field(ge=0.0, le=1.0)
    corporate: float = Field(ge=0.0, le=1.0)
    nationalist: float = Field(ge=0.0, le=1.0)
    gender_stereotyping: float = Field(ge=0.0, le=1.0)
    racial: float = Field(ge=0.0, le=1.0)
    cultural_western: float = Field(ge=0.0, le=1.0)
    academic_elitism: float = Field(ge=0.0, le=1.0)
    confirmation_bias: float = Field(ge=0.0, le=1.0)
    sensationalism: float = Field(ge=0.0, le=1.0)


class PerspectiveView(BaseModel):
    stakeholder: str = Field(max_length=80)
    viewpoint: str = Field(max_length=300)
    key_points: List[str] = Field(max_length=4)


class MissingStakeholder(BaseModel):
    group: str = Field(max_length=80)
    likely_view: str = Field(max_length=200)
    significance: float = Field(ge=0.0, le=1.0)


class LanguageSignalsOut(BaseModel):
    """The LLM part of the Narrative Integrity Layer. Scores describe wording, not truth."""
    bias_axes: BiasAxes
    dominant_bias: Literal[
        "political_left", "political_right", "corporate", "nationalist", "gender_stereotyping",
        "racial", "cultural_western", "academic_elitism", "confirmation_bias", "sensationalism", "none",
    ]
    bias_score: float = Field(ge=0.0, le=1.0)
    bias_phrases: List[str] = Field(max_length=6, description="Verbatim phrases from the claim text.")
    epistemic_quality: float = Field(ge=0.0, le=1.0, description="1 = certainty matches what the wording can support.")
    overclaiming: bool
    hedging_adequate: bool
    loaded_language: List[str] = Field(max_length=8, description="Verbatim loaded words from the claim text.")
    opposing: PerspectiveView
    neutral: PerspectiveView
    missing_stakeholders: List[MissingStakeholder] = Field(max_length=6)
    perspective_score: float = Field(ge=0.0, le=1.0, description="1 = every relevant stakeholder view is present.")


class AnalysisBundleOutput(BaseModel):
    fact_challenge: FactChallengeOut
    narrative_audit: NarrativeAuditOut
    language_signals: LanguageSignalsOut


# ── Judge ────────────────────────────────────────────────────────────────────

class JudgeClaimOut(BaseModel):
    claim_id: str
    label: Literal["supported", "contradicted", "mixed", "missing_context", "unverifiable"]
    evidence_for: List[EvidenceId]
    evidence_against: List[EvidenceId]
    missing_context: Optional[str] = Field(max_length=200)


class JudgeMetricsOut(BaseModel):
    CTS: float = Field(ge=0.0, le=1.0)
    NSS: float = Field(ge=0.0, le=1.0)
    BIS: float = Field(ge=0.0, le=1.0)
    PCS: float = Field(ge=0.0, le=1.0)
    EPS: float = Field(ge=0.0, le=1.0)


class JudgeOutput(BaseModel):
    verdict: Literal["TRUE", "MOSTLY_TRUE", "MIXED", "MOSTLY_FALSE", "FALSE", "UNVERIFIABLE"]
    verdict_confidence: float = Field(ge=0.0, le=1.0)
    claims: List[JudgeClaimOut]
    metrics: JudgeMetricsOut
    consensus_reasoning: str = Field(max_length=1200, description="A plain explanation for readers citing evidence ids like [e2].")
    key_supporting_evidence_ids: List[EvidenceId]
    key_contradicting_evidence_ids: List[EvidenceId]
    important_caveats: List[str] = Field(max_length=4)
    debate_summary: str = Field(max_length=600)
    needs_second_round: bool = Field(description="True only if the challengers disagree on evidence that is in the pack.")
    second_round_reason: Optional[str] = Field(max_length=160)
    public_note: str = Note


# ── Grounded Q&A and cache validation ───────────────────────────────────────

class QASentence(BaseModel):
    text: str = Field(max_length=500)
    chunk_ids: List[int] = Field(description="The CHUNK numbers this sentence is taken from.")


class QAOutput(BaseModel):
    found: bool = Field(description="False if the chunks don't answer the question.")
    sentences: List[QASentence] = Field(max_length=10)


class CacheValidationOutput(BaseModel):
    valid: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(max_length=160)

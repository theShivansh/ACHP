"""
Event protocol v2 (docs/upgrade/06_AGENT_STATE_SPEC.md §3): the envelope, one payload model per
event type, and the EvidenceObject.

Every emission goes through `RunEventBus.emit`, which validates `data` against `PAYLOADS[type]`
before it is stored, so a malformed event can't reach the log. `public_note` (agent.note) is the
only free-text field an LLM writes, and it is validated separately (achp.events.notes).

`python -m achp.events.models` writes the JSON Schema to `apps/api/schemas/events.v2.json`; the
web types in `apps/web/lib/runs/types.ts` are kept in sync with it by a unit test.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any, Dict, List, Literal, Optional, Tuple, Type, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

PROTOCOL_VERSION = 2

EventType = Literal[
    "run.queued", "run.started",
    "agent.started", "agent.action", "agent.note", "agent.done", "agent.skipped", "agent.failed",
    "evidence.found", "evidence.verified",
    "claim.extracted", "claim.marked",
    "signal.computed", "debate.round", "verdict.final", "assay.computed",
    "run.completed", "run.failed",
]
TERMINAL_TYPES = frozenset({"run.completed", "run.failed"})

Label = Literal["supported", "contradicted", "mixed", "missing_context", "unverifiable", "blocked"]
Band = Literal["strong", "moderate", "weak"]
Relation = Literal["contradicts", "supports", "missing_context", "framing", "unclear"]
ActionKind = Literal["search_web", "search_kb", "fetch_source", "llm_call", "compute", "validate"]
SignalKind = Literal["sentiment", "bias", "perspective", "framing", "hedging"]
Span = Tuple[int, int]


class _Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── run.* ────────────────────────────────────────────────────────────────────

class RunQueued(_Payload):
    position: int = Field(ge=1, description="1 = next to start")


class RunInput(_Payload):
    type: Literal["text"] = "text"
    text: str


class AgentInfo(_Payload):
    id: str
    name: str
    role: str
    model: Optional[str] = Field(None, description="Configured primary model; null for agents that call no model")
    fallback_model: Optional[str] = None
    group: str


class KBRef(_Payload):
    id: str
    name: str


class RunStarted(_Payload):
    input: RunInput
    agents: List[AgentInfo]
    pipeline_mode: Optional[str] = None
    kb: Optional[KBRef] = None
    prompt_version: Optional[str] = None


class RunCompleted(_Payload):
    total_ms: int = Field(ge=0)
    cache_hit: bool = False


class RunFailed(_Payload):
    stage: str
    error_code: str
    message: str
    retryable: bool


# ── agent.* ──────────────────────────────────────────────────────────────────

class AgentStarted(_Payload):
    step: int = Field(ge=1)
    group: Optional[str] = None
    round: Optional[int] = Field(None, ge=1, description="Debate round when the agent runs again")


class AgentAction(_Payload):
    action: ActionKind
    label: str = Field(max_length=40)
    detail: Optional[str] = Field(None, max_length=80)
    claim_id: Optional[str] = None


class AgentNote(_Payload):
    note: str = Field(min_length=1, max_length=140)
    claim_id: Optional[str] = None
    source: Literal["model", "template"] = Field(
        "template", description="model = a validated public_note; template = the deterministic fallback")


class AgentDone(_Payload):
    duration_ms: int = Field(ge=0)
    summary: str = Field(max_length=100)
    counts: Dict[str, int] = {}
    model: Optional[str] = Field(None, description="The model that actually served this agent's call")


class AgentSkipped(_Payload):
    reason: str


class AgentFailed(_Payload):
    error_code: str
    message: str
    retryable: bool


# ── evidence.* ───────────────────────────────────────────────────────────────

class EvidenceSource(_Payload):
    source_id: str
    kind: Literal["web", "kb", "context"]
    url: Optional[str] = None
    domain: Optional[str] = None
    title: Optional[str] = None
    published_at: Optional[str] = None


class EvidenceObject(_Payload):
    evidence_id: str = Field(pattern=r"^e\d+$")
    claim_id: Optional[str] = None
    source: EvidenceSource
    locator: str
    quote: str = Field(min_length=1, description="Verbatim substring of the retrieved text")
    relation: Optional[Relation] = None
    strength: Optional[float] = Field(None, ge=0.0, le=1.0)
    freshness: Optional[float] = Field(None, ge=0.0, le=1.0)
    verifier_status: Literal["pending", "accepted", "rejected"] = "pending"
    retrieved_at: Optional[str] = None


class EvidenceFound(_Payload):
    evidence: EvidenceObject


class EvidenceVerified(_Payload):
    evidence_id: str
    status: Literal["accepted", "rejected"]
    reason: Optional[str] = None


# ── claim.* ──────────────────────────────────────────────────────────────────

class ExtractedClaim(_Payload):
    claim_id: str
    text: str
    source_span: Span
    verifiable: bool
    epistemic_marker: str


class ClaimExtracted(_Payload):
    claim: ExtractedClaim


class ClaimMarked(_Payload):
    claim_id: str
    relation: Relation
    span: Span
    severity: Optional[int] = Field(None, ge=1, le=3)
    evidence_ids: List[str] = []
    note: Optional[str] = Field(None, max_length=140)


# ── signal / debate / verdict ────────────────────────────────────────────────

class SignalComputed(_Payload):
    signal: SignalKind
    label: str
    value: Optional[float] = Field(None, ge=0.0, le=1.0, description="Not shown to Sharers")
    spans: List[Span] = []
    explanation: Optional[str] = Field(None, max_length=140)


class DebateRound(_Payload):
    round: int = Field(ge=2)
    reason: str = Field(max_length=140)


class OverallVerdict(_Payload):
    label: Label
    summary: str = Field(max_length=140)
    confidence_band: Band
    confidence_reason: str
    judge_verdict: Optional[str] = Field(
        None, description="The Judge's six-level verdict (TRUE … UNVERIFIABLE, or BLOCKED)")


class ClaimVerdict(_Payload):
    claim_id: str
    label: Label
    confidence_band: Band
    confidence_reason: Optional[str] = None
    evidence_for: List[str] = []
    evidence_against: List[str] = []
    missing_context: Optional[str] = Field(None, max_length=140)


class Metrics(_Payload):
    CTS: float
    PCS: float
    BIS: float
    NSS: float
    EPS: float


class VerdictFinal(_Payload):
    overall: OverallVerdict
    claims: List[ClaimVerdict]
    metrics: Optional[Metrics] = None


class AssayComputed(_Payload):
    """Defined now so the contract is complete; emitted from P5 (11_THE_ASSAY.md)."""
    formula_version: str
    mode: Literal["code"]
    signals: Dict[str, Any]
    metrics: Metrics
    composite: float
    formula_verdict: str
    judge_verdict: str
    two_key: Dict[str, Any]
    ledger: Dict[str, Any]
    tipping_point: Dict[str, Any]
    masking: Dict[str, Any]
    integrity_map: Dict[str, Any]


PAYLOADS: Dict[str, Type[_Payload]] = {
    "run.queued": RunQueued,
    "run.started": RunStarted,
    "agent.started": AgentStarted,
    "agent.action": AgentAction,
    "agent.note": AgentNote,
    "agent.done": AgentDone,
    "agent.skipped": AgentSkipped,
    "agent.failed": AgentFailed,
    "evidence.found": EvidenceFound,
    "evidence.verified": EvidenceVerified,
    "claim.extracted": ClaimExtracted,
    "claim.marked": ClaimMarked,
    "signal.computed": SignalComputed,
    "debate.round": DebateRound,
    "verdict.final": VerdictFinal,
    "assay.computed": AssayComputed,
    "run.completed": RunCompleted,
    "run.failed": RunFailed,
}


class Event(BaseModel):
    """The envelope (06 §3). `seq` is gapless per run, from 1; `t_ms` counts from run.started."""
    model_config = ConfigDict(extra="forbid")

    v: Literal[2] = 2
    run_id: str
    seq: int = Field(ge=1)
    ts: str
    t_ms: int = Field(ge=0)
    type: EventType
    agent: Optional[str] = None
    data: Dict[str, Any]

    @property
    def terminal(self) -> bool:
        return self.type in TERMINAL_TYPES

    def sse(self) -> str:
        """One SSE frame: `id:` is the seq, so EventSource resends it as Last-Event-ID."""
        body = json.dumps(self.model_dump(), ensure_ascii=False, separators=(",", ":"))
        return f"id: {self.seq}\nevent: {self.type}\ndata: {body}\n\n"


def validate_payload(event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and normalise an event payload; raises pydantic.ValidationError or KeyError."""
    model = PAYLOADS[event_type]
    return model.model_validate(data).model_dump(mode="json", exclude_none=True)


# ── JSON Schema export ───────────────────────────────────────────────────────

def _typed_event(event_type: str, payload: Type[_Payload]) -> Type[BaseModel]:
    name = "".join(p.capitalize() for p in event_type.replace(".", "_").split("_")) + "Event"
    return type(name, (BaseModel,), {
        "__annotations__": {
            "v": Literal[2], "run_id": str, "seq": int, "ts": str, "t_ms": int,
            "type": Literal[event_type], "agent": Optional[str], "data": payload,
        },
        "agent": None,
        "model_config": ConfigDict(extra="forbid"),
    })


def json_schema() -> Dict[str, Any]:
    union = Union[tuple(_typed_event(t, m) for t, m in PAYLOADS.items())]  # type: ignore[valid-type]
    adapter = TypeAdapter(Annotated[union, Field(discriminator="type")])
    schema = adapter.json_schema(ref_template="#/$defs/{model}")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://achp/events.v2.json"
    schema["title"] = "ACHP event protocol v2"
    schema["x-event-types"] = list(PAYLOADS)
    schema["x-terminal-types"] = sorted(TERMINAL_TYPES)
    return schema


SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas" / "events.v2.json"


def write_schema(path: Path = SCHEMA_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    print(write_schema())

"""Request and run memory: the per-run working state shared by the agents."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from achp.evidence.pack import EvidencePack


@dataclass(frozen=True)
class RequestMemory:
    """What the caller asked. The claim is kept separate from any library context."""
    text: str
    kb_id: Optional[str] = None
    kb_name: Optional[str] = None
    kb_chunks: tuple = ()          # ({chunk_index, text, score}, …) read fresh for this run
    extra_context: tuple = ()      # loose context strings from legacy callers


@dataclass
class RunMemory:
    run_id: str
    request: RequestMemory
    evidence: EvidencePack = field(default_factory=lambda: EvidencePack(query=""))
    analysis: Any = None           # ClaimAnalysis (proposer)
    adversary_a: Any = None        # AdversaryAReport
    adversary_b: Any = None        # NarrativeAuditReport
    signals: Any = None            # LanguageSignalsOut (grounded)
    nil: Any = None                # NILResult
    judge: Any = None              # JudgeVerdict
    models: Dict[str, str] = field(default_factory=dict)
    llm_calls: List[Dict[str, Any]] = field(default_factory=list)
    grounding: Counter = field(default_factory=Counter)

    def record_call(self, stage: str, result: Any) -> None:
        self.llm_calls.append({
            "stage": stage, "model": result.model, "fallback_used": result.fallback_used,
            "attempts": result.attempts, "latency_ms": result.latency_ms, "queue_ms": result.queue_ms,
            "prompt_tokens": result.prompt_tokens, "completion_tokens": result.completion_tokens,
        })

    def add_grounding(self, counts: Counter) -> None:
        self.grounding.update({k: v for k, v in counts.items() if v})

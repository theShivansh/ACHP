"""
ACHP — canonical model registry.

The one place that decides which Groq model serves which logical role. Every LLM call in the
backend goes through `achp.llm.runtime.GroqRuntime`, which reads its models from here.

Logical agents keep their identities (Proposer, Adversary A, Adversary B, NIL, Judge), but they
run as three physical calls:

    proposer   → ProposerOutput          (1 call)
    analysis   → AnalysisBundleOutput     (1 call: Adversary A + Adversary B + NIL LLM signals)
    judge      → JudgeOutput              (1 call)

`adversary_a`, `adversary_b` and `nil` are listed so `run.started.agents[]` can report the model
that actually served each logical agent; they resolve to the `analysis` bundle's models.

Environment overrides (all optional):
    ACHP_MODEL_PRIMARY / ACHP_MODEL_FALLBACK        every role
    ACHP_<ROLE>_MODEL / ACHP_<ROLE>_FALLBACK_MODEL  one role (ROLE = PROPOSER, ANALYSIS, JUDGE, QA, CACHE_VALIDATOR)
    PROPOSER_MODEL, ADVERSARY_A_MODEL, ADVERSARY_B_MODEL, JUDGE_MODEL, JUDGE_FALLBACK_MODEL
        legacy names, still honoured (the analysis bundle takes ADVERSARY_A_MODEL)

A fallback equal to its primary is a configuration error that silently removes the fallback
(both calls share one rate-limit bucket). The registry rejects it and restores the default.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Dict, Literal, Optional

logger = logging.getLogger(__name__)

PRIMARY_MODEL = "openai/gpt-oss-120b"
FALLBACK_MODEL = "openai/gpt-oss-20b"

ReasoningEffort = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class RoleConfig:
    role: str
    primary: str
    fallback: str
    # Completion budget. gpt-oss spends reasoning tokens from this budget before the JSON.
    max_completion_tokens: int
    temperature: float
    reasoning_effort: ReasoningEffort


# Physical roles: each is one Groq call shape.
_DEFAULTS: Dict[str, RoleConfig] = {
    "proposer": RoleConfig("proposer", PRIMARY_MODEL, FALLBACK_MODEL, 1600, 0.1, "low"),
    "analysis": RoleConfig("analysis", PRIMARY_MODEL, FALLBACK_MODEL, 3200, 0.2, "low"),
    "judge": RoleConfig("judge", PRIMARY_MODEL, FALLBACK_MODEL, 2400, 0.1, "medium"),
    "qa": RoleConfig("qa", PRIMARY_MODEL, FALLBACK_MODEL, 1400, 0.0, "low"),
    "cache_validator": RoleConfig("cache_validator", PRIMARY_MODEL, FALLBACK_MODEL, 300, 0.0, "low"),
}

# Logical agent → physical role (for reporting which model served which lane).
LOGICAL_TO_ROLE: Dict[str, str] = {
    "proposer": "proposer",
    "adversary_a": "analysis",
    "adversary_b": "analysis",
    "nil_supervisor": "analysis",
    "judge": "judge",
}

_LEGACY_PRIMARY_ENV = {
    "proposer": "PROPOSER_MODEL",
    "analysis": "ADVERSARY_A_MODEL",
    "judge": "JUDGE_MODEL",
}
_LEGACY_FALLBACK_ENV = {"judge": "JUDGE_FALLBACK_MODEL"}


def _env(name: str) -> Optional[str]:
    value = os.getenv(name, "").strip()
    return value or None


def resolve(role: str) -> RoleConfig:
    """Return the effective config for a physical role, applying env overrides."""
    if role not in _DEFAULTS:
        raise KeyError(f"unknown LLM role '{role}'; known: {sorted(_DEFAULTS)}")
    base = _DEFAULTS[role]
    key = role.upper()
    primary = (
        _env(f"ACHP_{key}_MODEL")
        or _env(_LEGACY_PRIMARY_ENV.get(role, ""))
        or _env("ACHP_MODEL_PRIMARY")
        or base.primary
    )
    fallback = (
        _env(f"ACHP_{key}_FALLBACK_MODEL")
        or _env(_LEGACY_FALLBACK_ENV.get(role, ""))
        or _env("ACHP_MODEL_FALLBACK")
        or base.fallback
    )
    if fallback == primary:
        alt = FALLBACK_MODEL if primary != FALLBACK_MODEL else PRIMARY_MODEL
        logger.warning(
            "LLM registry: role '%s' had fallback == primary (%s); using %s as fallback",
            role, primary, alt,
        )
        fallback = alt
    return RoleConfig(
        role=role,
        primary=primary,
        fallback=fallback,
        max_completion_tokens=base.max_completion_tokens,
        temperature=base.temperature,
        reasoning_effort=base.reasoning_effort,
    )


def roles() -> Dict[str, RoleConfig]:
    return {r: resolve(r) for r in _DEFAULTS}


def logical_models() -> Dict[str, Dict[str, str]]:
    """{logical_agent: {primary, fallback, role}}, for run.started.agents[] and /health/llm."""
    out: Dict[str, Dict[str, str]] = {}
    for agent, role in LOGICAL_TO_ROLE.items():
        cfg = resolve(role)
        out[agent] = {"role": role, "primary": cfg.primary, "fallback": cfg.fallback}
    return out

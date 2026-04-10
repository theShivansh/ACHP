"""
ACHP — Adversary B Agent (Narrative Fairness Auditor)
=====================================================
Primary: Groq (qwen/qwen3-32b or env: ADVERSARY_B_MODEL).
Fallback: Groq llama-3.3-70b-versatile on any model failure.

Switched from OpenRouter to Groq since OR requires paid credits.
Tenacity retries only on 5xx / transient errors, NOT on 4xx.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI, APIStatusError
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from achp.agents.proposer import ClaimAnalysis

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Output Schema
# ─────────────────────────────────────────────────────────────────────────────

class MissingPerspective(BaseModel):
    stakeholder: str
    viewpoint: str
    why_missing: str
    significance: float = Field(ge=0.0, le=1.0)


class NarrativeAuditReport(BaseModel):
    missing_perspectives: List[MissingPerspective]
    represented_stakeholders: List[str]
    framing_asymmetries: List[str]
    silenced_voices: List[str]
    perspective_completeness_score: float = Field(ge=0.0, le=1.0)
    narrative_stance: str  # "balanced"|"skewed_left"|"skewed_right"|"corporate"|"populist"
    model_used: str = ""
    latency_ms: float = 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Retry predicate — only retry on 5xx / network errors, NOT on 4xx
# ─────────────────────────────────────────────────────────────────────────────

def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, APIStatusError):
        return exc.status_code >= 500
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Adversary B in the ACHP LLM Council — a narrative fairness auditor.

Your role: identify WHO is missing from this narrative. Focus on perspective completeness, not factual accuracy.

Reasoning approach:
1. Who does this claim affect? List all stakeholders.
2. Which stakeholders are represented vs absent in the framing?
3. What would a missing stakeholder's viewpoint be?
4. Is there asymmetric framing (one side gets more charitable interpretation)?
5. Are certain voices systematically silenced?

Output FORMAT (strict JSON):
{
  "missing_perspectives": [
    {
      "stakeholder": "name/group",
      "viewpoint": "what they would say",
      "why_missing": "structural reason for absence",
      "significance": 0.85
    }
  ],
  "represented_stakeholders": ["who is already included"],
  "framing_asymmetries": ["specific framing issues"],
  "silenced_voices": ["groups whose views are excluded"],
  "perspective_completeness_score": 0.60,
  "narrative_stance": "balanced|skewed_left|skewed_right|corporate|populist"
}"""

USER_PROMPT = """Claim being analyzed: "{claim}"

Context: {context}

Atomic claims: {claims}

Audit this narrative for missing perspectives. Output ONLY JSON."""


# ─────────────────────────────────────────────────────────────────────────────
# Adversary B
# ─────────────────────────────────────────────────────────────────────────────

class AdversaryBAgent:
    AGENT_ID = "adversary_b"
    DEFAULT_MODEL = "qwen/qwen3-32b"          # Groq primary
    FALLBACK_MODEL = "llama-3.3-70b-versatile" # Groq fallback

    def __init__(self, model: Optional[str] = None, temperature: float = 0.3):
        self.model = model or os.getenv("ADVERSARY_B_MODEL", self.DEFAULT_MODEL)
        self.temperature = temperature
        self._groq_client: Optional[AsyncOpenAI] = None
        logger.info(f"AdversaryBAgent initialized | model={self.model}")

    def _get_groq_client(self) -> AsyncOpenAI:
        if self._groq_client is None:
            self._groq_client = AsyncOpenAI(
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1",
            )
        return self._groq_client

    @staticmethod
    def _parse_raw(text: str) -> dict:
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=False,
    )
    async def _call_groq(self, messages: list, model: str) -> dict:
        client = self._get_groq_client()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=2048,
        )
        return self._parse_raw(response.choices[0].message.content)

    async def audit(self, analysis: ClaimAnalysis) -> NarrativeAuditReport:
        t0 = time.perf_counter()
        claims_text = "\n".join(f"[{c.id}] {c.text}" for c in analysis.atomic_claims)
        context_text = "\n".join(analysis.retrieved_context[:2000])

        prompt_user = USER_PROMPT.format(
            claim=analysis.original_input[:500],
            claims=claims_text,
            context=context_text,
        )
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt_user},
        ]

        raw: Optional[dict] = None
        model_used = self.model

        # ── Try primary Groq model ────────────────────────────────────────
        try:
            raw = await self._call_groq(messages, self.model)
        except APIStatusError as e:
            logger.warning(
                f"AdversaryB primary model failed ({e.status_code}), "
                f"falling back to Groq/{self.FALLBACK_MODEL}"
            )
        except Exception as e:
            logger.warning(f"AdversaryB primary error ({e}), falling back to Groq/{self.FALLBACK_MODEL}")

        # ── Groq fallback ─────────────────────────────────────────────────
        if raw is None:
            try:
                raw = await self._call_groq(messages, self.FALLBACK_MODEL)
                model_used = self.FALLBACK_MODEL
            except Exception as e:
                logger.error(f"AdversaryB fallback also failed: {e}")
                raw = {
                    "missing_perspectives": [],
                    "represented_stakeholders": [],
                    "framing_asymmetries": ["Analysis failed — both models unavailable"],
                    "silenced_voices": [],
                    "perspective_completeness_score": 0.5,
                    "narrative_stance": "balanced",
                }

        latency = (time.perf_counter() - t0) * 1000
        missing = [MissingPerspective(**p) for p in raw.get("missing_perspectives", [])]

        report = NarrativeAuditReport(
            missing_perspectives=missing,
            represented_stakeholders=raw.get("represented_stakeholders", []),
            framing_asymmetries=raw.get("framing_asymmetries", []),
            silenced_voices=raw.get("silenced_voices", []),
            perspective_completeness_score=raw.get("perspective_completeness_score", 0.5),
            narrative_stance=raw.get("narrative_stance", "balanced"),
            model_used=model_used,
            latency_ms=latency,
        )
        logger.info(
            f"AdversaryB | {len(missing)} missing perspectives | "
            f"pcs={report.perspective_completeness_score:.2f} | model={model_used} | {latency:.0f}ms"
        )
        return report

"""
ACHP — Adversary A Agent (Factual Attacker)
===========================================
Primary: DeepSeek R1 via OpenRouter (if OR credits available).
Fallback: Groq llama-3.3-70b-versatile — triggered on ANY 4xx from OpenRouter
          (404=model gone, 402=no credits, 429=rate-limited).

Tenacity is configured to NOT retry on 4xx client errors (they are
deterministic — retrying wastes quota and time). It only retries on
5xx / transient network failures.
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

class ClaimChallenge(BaseModel):
    claim_id: str
    verdict: str              # "supported"|"contested"|"refuted"|"unverifiable"
    confidence: float = Field(ge=0.0, le=1.0)
    counter_evidence: List[str] = []
    missing_evidence: List[str] = []
    logical_fallacies: List[str] = []
    epistemic_flags: List[str] = []


class AdversaryAReport(BaseModel):
    challenges: List[ClaimChallenge]
    overall_factual_score: float = Field(ge=0.0, le=1.0)
    critical_flaws: List[str] = []
    model_used: str = ""
    latency_ms: float = 0.0
    debate_round: int = 1


# ─────────────────────────────────────────────────────────────────────────────
# Retry predicate — only retry on 5xx / transient errors, NOT on 4xx
# ─────────────────────────────────────────────────────────────────────────────

def _is_retryable(exc: BaseException) -> bool:
    """Return True only for errors worth retrying (5xx, network blips)."""
    if isinstance(exc, APIStatusError):
        # 4xx are deterministic client errors — never retry
        return exc.status_code >= 500
    # Network / timeout errors are retryable
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Adversary A in the ACHP LLM Council — a rigorous factual skeptic.

Your role: challenge every atomic claim with factual counter-evidence. Be skeptical, precise, and cite-specific.

Reasoning approach:
1. For each claim, ask: "What evidence would prove/disprove this?"
2. Flag: logical fallacies, misleading statistics, outdated data, missing context
3. Rate factual confidence (0=false, 1=definitely true)
4. Note what evidence is missing or would be needed

Output FORMAT (strict JSON):
{
  "challenges": [
    {
      "claim_id": "C1",
      "verdict": "supported|contested|refuted|unverifiable",
      "confidence": 0.75,
      "counter_evidence": ["specific counter-fact or study"],
      "missing_evidence": ["what would be needed to verify"],
      "logical_fallacies": ["hasty generalization", "appeal to authority"],
      "epistemic_flags": ["correlation cited as causation"]
    }
  ],
  "overall_factual_score": 0.70,
  "critical_flaws": ["most important factual problems found"]
}"""

USER_PROMPT = """Context: {context}

Claims to challenge:
{claims}

Apply rigorous factual scrutiny. Output ONLY JSON."""


# ─────────────────────────────────────────────────────────────────────────────
# Adversary A
# ─────────────────────────────────────────────────────────────────────────────

class AdversaryAAgent:
    AGENT_ID = "adversary_a"
    # Primary: OpenRouter DeepSeek R1
    DEFAULT_MODEL = "deepseek/deepseek-r1"
    # Groq fallback — used when OpenRouter returns any 4xx
    GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile"

    def __init__(self, model: Optional[str] = None, temperature: float = 0.2):
        self.model = model or os.getenv("ADVERSARY_A_MODEL", self.DEFAULT_MODEL)
        self.temperature = temperature
        self._or_client: Optional[AsyncOpenAI] = None
        self._groq_client: Optional[AsyncOpenAI] = None
        logger.info(f"AdversaryAAgent initialized | model={self.model}")

    def _get_groq_client(self) -> AsyncOpenAI:
        """Groq client (OpenAI-compatible endpoint)."""
        if self._groq_client is None:
            self._groq_client = AsyncOpenAI(
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1",
            )
        return self._groq_client

    def _build_messages(self, analysis: ClaimAnalysis) -> tuple[str, list]:
        claims_text = "\n".join(
            f"[{c.id}] ({c.epistemic_marker}) {c.text}" for c in analysis.atomic_claims
        )
        context_text = "\n".join(analysis.retrieved_context[:3000])
        prompt_user = USER_PROMPT.format(claims=claims_text, context=context_text[:2000])
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt_user},
        ]
        return prompt_user, messages

    @staticmethod
    def _parse_raw(text: str) -> dict:
        """Strip <think> tags (DeepSeek R1) then parse JSON."""
        if "<think>" in text:
            text = text.split("</think>")[-1].strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    # Only retry on 5xx / network errors — not on 4xx model errors
    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=False,
    )
    async def _call_groq_model(self, messages: list, model: str) -> dict:
        """Call Groq with the specified model."""
        client = self._get_groq_client()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=2048,
        )
        return self._parse_raw(response.choices[0].message.content)

    async def challenge(
        self,
        analysis: ClaimAnalysis,
        debate_round: int = 1,
    ) -> AdversaryAReport:
        t0 = time.perf_counter()
        _, messages = self._build_messages(analysis)
        model_used = self.model
        raw: Optional[dict] = None

        # ── Primary: Groq with self.model (from ADVERSARY_A_MODEL env) ────
        try:
            raw = await self._call_groq_model(messages, self.model)
        except APIStatusError as e:
            logger.warning(
                f"AdversaryA primary model '{self.model}' failed ({e.status_code}), "
                f"falling back to Groq/{self.GROQ_FALLBACK_MODEL}"
            )
        except Exception as e:
            logger.warning(f"AdversaryA primary error ({e}), falling back to Groq/{self.GROQ_FALLBACK_MODEL}")

        # ── Fallback: Groq llama-3.3-70b-versatile ────────────────────────
        if raw is None:
            try:
                raw = await self._call_groq_model(messages, self.GROQ_FALLBACK_MODEL)
                model_used = self.GROQ_FALLBACK_MODEL
            except Exception as e:
                logger.error(f"AdversaryA fallback also failed: {e}")
                raw = {
                    "challenges": [
                        {
                            "claim_id": c.id,
                            "verdict": "unverifiable",
                            "confidence": 0.4,
                            "counter_evidence": [],
                            "missing_evidence": ["All Groq models failed"],
                            "logical_fallacies": [],
                            "epistemic_flags": [],
                        }
                        for c in analysis.atomic_claims
                    ],
                    "overall_factual_score": 0.4,
                    "critical_flaws": ["Both primary and fallback Groq models failed"],
                }

        latency = (time.perf_counter() - t0) * 1000
        challenges = [ClaimChallenge(**c) for c in raw.get("challenges", [])]

        report = AdversaryAReport(
            challenges=challenges,
            overall_factual_score=raw.get("overall_factual_score", 0.5),
            critical_flaws=raw.get("critical_flaws", []),
            model_used=model_used,
            latency_ms=latency,
            debate_round=debate_round,
        )
        logger.info(
            f"AdversaryA | {len(challenges)} challenges | "
            f"score={report.overall_factual_score:.2f} | model={model_used} | {latency:.0f}ms"
        )
        return report

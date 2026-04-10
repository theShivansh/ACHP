"""
ACHP — Proposer Agent
=====================
Llama 4 Scout via Groq (long-context, fast).
Decomposes a claim into atomic sub-claims with citations.
Output is a structured ClaimAnalysis Pydantic model consumed by the debate layer.

Post-training concept: uses SFT-style chain-of-thought prompting
so the model reasons step-by-step before producing JSON output.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Output Schema
# ─────────────────────────────────────────────────────────────────────────────

class AtomicClaim(BaseModel):
    id: str
    text: str
    verifiable: bool
    confidence: float = Field(ge=0.0, le=1.0)
    citations: List[str] = []
    epistemic_marker: str = "claims"   # "claims"|"argues"|"shows"|"suggests"
    source_url: Optional[str] = None   # exact web URL if sourced from web search
    kb_page:    Optional[int] = None   # chunk index if sourced from a KB
    kb_name:    Optional[str] = None   # KB display name


class ClaimAnalysis(BaseModel):
    original_input: str
    atomic_claims: List[AtomicClaim]
    overall_confidence: float = Field(ge=0.0, le=1.0)
    claim_type: str   # "factual"|"opinion"|"prediction"|"mixed"
    context_summary: str
    retrieved_context: List[str] = []
    latency_ms: float = 0.0
    model_used: str = ""
    token_usage: Dict[str, int] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Prompt Templates (SFT-style CoT)
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the ACHP Proposer — an expert claim analyst applying structured chain-of-thought reasoning.

Your task: decompose a user's input into atomic, independently verifiable sub-claims.

## Reasoning Process (think step-by-step):
1. Identify the core assertion(s) in the input
2. Break each compound claim into atomic units (one fact per claim)
3. Assess verifiability (can it be checked against evidence?)
4. Assign epistemic markers (claims/argues/shows/suggests/states)
5. Note any hedging, certainty, or speculative language
6. Map each claim to its evidence source if available in context

## Output Format (strict JSON):
{
  "atomic_claims": [
    {
      "id": "C1",
      "text": "exact atomic claim text",
      "verifiable": true,
      "confidence": 0.85,
      "citations": ["source hint or URL if inferable from context"],
      "source_url": null,
      "kb_page": null,
      "epistemic_marker": "claims"
    }
  ],
  "overall_confidence": 0.80,
  "claim_type": "factual|opinion|prediction|mixed",
  "context_summary": "one sentence summary of what is being claimed"
}

## CRITICAL source attribution rules — read extremely carefully:

- `kb_page`: Look at the Retrieved Context for blocks that start with `[CHUNK N]`.
  If a chunk supports this specific atomic claim, set `kb_page` to that integer N.
  EXAMPLE: If context contains `[CHUNK 2]\nEmmanuel Macron became president in 2017...`
           and the claim is about Macron becoming president, set `"kb_page": 2`.
  If NO chunk in the context supports this claim, set `kb_page` to null.
  NEVER set kb_page to 0 by default — 0 is a valid chunk index, use it only when CHUNK 0 actually supports the claim.

- `source_url`: Set to a valid https:// URL ONLY if that exact URL appears verbatim in the provided context. Otherwise MUST be null. Never invent or guess URLs.

- `verifiable`: true only if the claim can be checked against objective external evidence
- Be precise. Do not add claims not present in the input."""

USER_PROMPT_TEMPLATE = """Retrieved Context:
{context}

---
Claim to analyze:
"{claim}"

Apply chain-of-thought reasoning, then output ONLY the JSON object."""


# ─────────────────────────────────────────────────────────────────────────────
# Proposer Agent
# ─────────────────────────────────────────────────────────────────────────────

class ProposerAgent:
    AGENT_ID = "proposer"
    DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
    FALLBACK_MODEL = "llama-3.3-70b-versatile"

    def __init__(
        self,
        model: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.1,
    ):
        self.model = model or os.getenv("PROPOSER_MODEL", self.DEFAULT_MODEL)
        self.max_tokens = max_tokens
        self.temperature = temperature
        self._client = None
        logger.info(f"ProposerAgent initialized | model={self.model}")

    def _get_client(self):
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        return self._client

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def analyze(
        self,
        claim: str,
        retrieved_context: Optional[List[str]] = None,
    ) -> ClaimAnalysis:
        """
        Decompose a claim into atomic sub-claims.
        Called by the Orchestrator after Retriever completes.
        """
        t0 = time.perf_counter()
        context_str = "\n".join(retrieved_context or []) or "No context retrieved."

        prompt = USER_PROMPT_TEMPLATE.format(claim=claim, context=context_str[:4000])
        client = self._get_client()

        try:
            response = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt},
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
            )
        except Exception as e:
            logger.warning(f"ProposerAgent: primary model failed ({e}), trying fallback")
            response = await client.chat.completions.create(
                model=self.FALLBACK_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt},
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
            )

        raw = json.loads(response.choices[0].message.content)
        latency = (time.perf_counter() - t0) * 1000

        atomic_claims = [
            AtomicClaim(**c) for c in raw.get("atomic_claims", [])
        ]

        result = ClaimAnalysis(
            original_input=claim,
            atomic_claims=atomic_claims,
            overall_confidence=raw.get("overall_confidence", 0.5),
            claim_type=raw.get("claim_type", "mixed"),
            context_summary=raw.get("context_summary", ""),
            retrieved_context=retrieved_context or [],
            latency_ms=latency,
            model_used=self.model,
            token_usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
            },
        )

        logger.info(
            f"ProposerAgent | {len(atomic_claims)} atomic claims | "
            f"type={result.claim_type} | {latency:.0f}ms"
        )
        return result

    async def health_check(self) -> Dict[str, Any]:
        try:
            result = await self.analyze("The sky is blue.")
            return {"status": "ok", "claims": len(result.atomic_claims), "model": self.model}
        except Exception as e:
            return {"status": "error", "error": str(e)}

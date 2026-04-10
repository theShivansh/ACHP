"""
ACHP — Synthetic Data Generator
================================
Post-training inspired: generates SFT/DPO/GRPO training pairs
from real pipeline runs.

SFT pairs:  (claim, ideal_neutral_analysis)
DPO pairs:  (claim, chosen=neutral, rejected=biased_response)
GRPO data:  (claim, reasoning_trace, reward_signal)

The neutral perspective expansion uses SFT-style prompting
to finetune smaller models for cheaper inference.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "synthetic"


class SyntheticDataGenerator:
    """Generates training pairs from ACHP pipeline outputs."""

    NEUTRALIZER_MODEL  = "mistralai/mixtral-8x7b-instruct"
    BIASED_GEN_MODEL   = "mistralai/mixtral-8x7b-instruct"

    SFT_PROMPT = """You are a neutral fact-checking analyst.
Given the claim below, write a balanced, well-evidenced analysis.
Do not show bias. Reference all major perspectives.
Output a brief but comprehensive analysis (150-250 words).

Claim: {claim}
Known verdict: {verdict}
Key facts: {facts}"""

    REJECTED_PROMPT = """Write a biased, one-sided analysis of this claim.
Intentionally omit counter-evidence and use loaded language.
Claim: {claim}"""

    def __init__(self):
        self._client: Optional[AsyncOpenAI] = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=os.getenv("OPENROUTER_API_KEY"),
                base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            )
        return self._client

    async def generate_from_result(self, result: Any) -> Dict[str, Any]:
        """
        From a PipelineResult, generate SFT + DPO training pairs.
        Saves to data/synthetic/{run_id}.json
        """
        claim = result.input_text
        verdict = result.verdict
        facts = result.key_supporting_evidence[:3] + result.key_contradicting_evidence[:2]

        sft_pair = await self._generate_sft_pair(claim, verdict, facts)
        dpo_pair = await self._generate_dpo_pair(claim, sft_pair.get("chosen", ""))
        grpo_data = self._build_grpo_signal(result)

        record = {
            "run_id":    result.run_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "claim":     claim,
            "verdict":   verdict,
            "metrics":   result.metrics,
            "sft": sft_pair,
            "dpo": dpo_pair,
            "grpo": grpo_data,
        }

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        out_path = DATA_DIR / f"{result.run_id}_{int(time.time())}.json"
        out_path.write_text(json.dumps(record, indent=2))
        logger.info(f"Synthetic data saved → {out_path}")
        return record

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=5))
    async def _generate_sft_pair(self, claim: str, verdict: str, facts: List[str]) -> Dict:
        """Generate: (input, ideal neutral output) for SFT."""
        try:
            client = self._get_client()
            resp = await client.chat.completions.create(
                model=self.NEUTRALIZER_MODEL,
                messages=[{
                    "role": "user",
                    "content": self.SFT_PROMPT.format(
                        claim=claim, verdict=verdict, facts="\n".join(facts)
                    ),
                }],
                temperature=0.3, max_tokens=512,
                extra_headers={"HTTP-Referer": "https://achp.research", "X-Title": "ACHP-SFT"},
            )
            chosen = resp.choices[0].message.content
        except Exception as e:
            chosen = f"[Generation failed: {e}]"

        return {
            "type": "sft",
            "instruction": f"Analyze this claim neutrally: {claim}",
            "input": claim,
            "output": chosen,
        }

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=5))
    async def _generate_dpo_pair(self, claim: str, chosen: str) -> Dict:
        """Generate: (chosen=neutral, rejected=biased) for DPO."""
        try:
            client = self._get_client()
            resp = await client.chat.completions.create(
                model=self.BIASED_GEN_MODEL,
                messages=[{
                    "role": "user",
                    "content": self.REJECTED_PROMPT.format(claim=claim),
                }],
                temperature=0.8, max_tokens=256,
                extra_headers={"HTTP-Referer": "https://achp.research", "X-Title": "ACHP-DPO"},
            )
            rejected = resp.choices[0].message.content
        except Exception as e:
            rejected = f"[Generation failed: {e}]"

        return {
            "type": "dpo",
            "prompt": claim,
            "chosen": chosen,
            "rejected": rejected,
        }

    def _build_grpo_signal(self, result: Any) -> Dict:
        """
        Build GRPO reward signal from pipeline metrics.
        Reward = composite score for neutral responses.
        Penalty for high BIS (bias) and low PCS (perspective).
        """
        metrics = result.metrics
        reward = (
            + metrics.get("CTS", 0) * 0.30
            + metrics.get("PCS", 0) * 0.25
            + metrics.get("NSS", 0) * 0.20
            + metrics.get("EPS", 0) * 0.15
            - metrics.get("BIS", 0) * 0.10   # penalty for bias
        )
        return {
            "type": "grpo",
            "claim": result.input_text,
            "reasoning_trace": result.consensus_reasoning,
            "reward": round(max(0.0, min(1.0, reward)), 4),
            "reward_components": {
                "cts_contribution":  round(metrics.get("CTS", 0) * 0.30, 4),
                "pcs_contribution":  round(metrics.get("PCS", 0) * 0.25, 4),
                "nss_contribution":  round(metrics.get("NSS", 0) * 0.20, 4),
                "eps_contribution":  round(metrics.get("EPS", 0) * 0.15, 4),
                "bis_penalty":       round(metrics.get("BIS", 0) * 0.10, 4),
            },
        }

    async def generate_batch(self, claims: List[str], verdicts: List[str]) -> List[Dict]:
        """Batch generate SFT pairs for a list of claims."""
        tasks = [
            self._generate_sft_pair(c, v, []) for c, v in zip(claims, verdicts)
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)

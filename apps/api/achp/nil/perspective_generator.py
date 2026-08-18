"""ACHP — Perspective Generator (NIL Sub-agent 3/5)
Uses Groq openai/gpt-oss-120b for perspective analysis.
Falls back to heuristic output if no API key is configured.
"""
from __future__ import annotations
import json, logging, os
from typing import Any, Dict, List
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You generate missing perspectives for balanced news analysis.
For the given claim, identify 3-5 stakeholder groups whose views are absent.
Output ONLY JSON: {"perspectives": [{"stakeholder":"X","viewpoint":"Y","significance":0.8}], "missing_stakeholders":[], "completeness_gaps":[]}"""

class PerspectiveGenerator:
    DEFAULT_MODEL = "openai/gpt-oss-120b"

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                return None
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
            )
        return self._client

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=8))
    async def generate(self, text: str) -> Dict[str, Any]:
        client = self._get_client()
        if client is None:
            return {
                "perspectives": [],
                "missing_stakeholders": ["unavailable — GROQ_API_KEY not set"],
                "completeness_gaps": [],
                "error": "no_api_key",
            }
        try:
            resp = await client.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": f'Claim: "{text[:600]}"'},
                ],
                temperature=0.4, max_tokens=1024,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            logger.warning(f"PerspectiveGenerator fallback: {e}")
            return {
                "perspectives": [],
                "missing_stakeholders": ["analysis unavailable"],
                "completeness_gaps": [],
                "error": str(e),
            }

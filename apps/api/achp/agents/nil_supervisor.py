"""
ACHP — NIL Supervisor Agent
============================
Spawns 5 parallel async NIL sub-agents:
  1. SentimentAnalyzer
  2. BiasClassifier
  3. PerspectiveGenerator
  4. FramingComparator
  5. ConfidenceSynthesizer

Collects all results concurrently and packages a NILReport.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class NILReport(BaseModel):
    sentiment: Dict[str, Any] = {}
    bias: Dict[str, Any] = {}
    perspectives: Dict[str, Any] = {}
    framing: Dict[str, Any] = {}
    nil_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    nil_verdict: str = "unknown"     # "neutral"|"biased"|"misleading"|"propaganda"
    nil_summary: str = ""
    sub_agent_latencies: Dict[str, float] = {}
    total_latency_ms: float = 0.0


class NILSupervisorAgent:
    AGENT_ID = "nil_supervisor"

    def __init__(self):
        # Lazy import sub-agents to avoid circular imports
        self._sentiment = None
        self._bias = None
        self._perspective = None
        self._framing = None
        self._synthesizer = None
        logger.info("NILSupervisorAgent initialized")

    def _load_agents(self):
        from achp.nil.sentiment_analyzer    import SentimentAnalyzer
        from achp.nil.bias_classifier       import BiasClassifier
        from achp.nil.perspective_generator import PerspectiveGenerator
        from achp.nil.framing_comparator    import FramingComparator
        from achp.nil.confidence_synthesizer import ConfidenceSynthesizer

        if self._sentiment    is None: self._sentiment    = SentimentAnalyzer()
        if self._bias         is None: self._bias         = BiasClassifier()
        if self._perspective  is None: self._perspective  = PerspectiveGenerator()
        if self._framing      is None: self._framing      = FramingComparator()
        if self._synthesizer  is None: self._synthesizer  = ConfidenceSynthesizer()

    async def _run_safe(self, name: str, coro) -> tuple[str, Any, float]:
        """Run a sub-agent coroutine, catching errors gracefully."""
        t0 = time.perf_counter()
        try:
            result = await coro
            latency = (time.perf_counter() - t0) * 1000
            return name, result, latency
        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000
            logger.warning(f"NIL sub-agent '{name}' failed: {e}")
            return name, {"error": str(e), "status": "failed"}, latency

    async def run(self, text: str, context: Optional[str] = None) -> NILReport:
        """
        Spawn all 5 NIL sub-agents in parallel via asyncio.gather.
        Each sub-agent gets independent input — true parallelism.
        """
        t0 = time.perf_counter()
        self._load_agents()

        # Launch all 5 concurrently
        tasks = await asyncio.gather(
            self._run_safe("sentiment",    self._sentiment.analyze(text)),
            self._run_safe("bias",         self._bias.classify(text)),
            self._run_safe("perspective",  self._perspective.generate(text)),
            self._run_safe("framing",      self._framing.compare(text, context or "")),
            return_exceptions=False,
        )

        results: Dict[str, Any] = {}
        latencies: Dict[str, float] = {}
        for name, result, latency in tasks:
            results[name] = result
            latencies[name] = latency

        # Synthesize after all sub-agents complete
        synth_t0 = time.perf_counter()
        synthesis = await self._synthesizer.synthesize(results)
        latencies["synthesizer"] = (time.perf_counter() - synth_t0) * 1000

        total_latency = (time.perf_counter() - t0) * 1000

        report = NILReport(
            sentiment=results.get("sentiment", {}),
            bias=results.get("bias", {}),
            perspectives=results.get("perspective", {}),
            framing=results.get("framing", {}),
            nil_confidence=synthesis.get("nil_confidence", 0.5),
            nil_verdict=synthesis.get("nil_verdict", "unknown"),
            nil_summary=synthesis.get("nil_summary", ""),
            sub_agent_latencies=latencies,
            total_latency_ms=total_latency,
        )

        logger.info(
            f"NILSupervisor complete | verdict={report.nil_verdict} | "
            f"confidence={report.nil_confidence:.2f} | {total_latency:.0f}ms"
        )
        return report

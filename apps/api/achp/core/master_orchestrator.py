"""
ACHP — Master Orchestrator
===========================
Central async router implementing the full 8-step pipeline:

  Step 1  SecurityValidator.validate_input()       [sync, ~1ms]
  Step 2  Retriever.retrieve()                     [async, cache-first]
  Step 3  Proposer.analyze()                       [async, Llama 4 Scout]
  Step 4  AdversaryA.challenge() ┐                 [parallel async]
  Step 5  AdversaryB.audit()     ┘                 [parallel async]
  Step 6  NILSupervisor.run()    (5 sub-agents)    [parallel async]
  Step 7  Judge.judge()                            [async, all inputs]
  Step 8  SecurityValidator.validate_output()       [sync, ~1ms]

Planning Mode internally:
  - Pre-flight claim type routing (factual / opinion / prediction)
  - Dynamic model selection based on claim complexity
  - Conditional NIL skipping for pure factual queries
  - Debate round escalation if Judge confidence < threshold

Post-training concept:
  - Generates SFT/DPO training pairs from each run (optional)
  - Logs reasoning traces for GRPO reward signal construction
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Enums & Config
# ─────────────────────────────────────────────────────────────────────────────

class ClaimType(str, Enum):
    FACTUAL    = "factual"
    OPINION    = "opinion"
    PREDICTION = "prediction"
    MIXED      = "mixed"


class PipelineMode(str, Enum):
    FULL      = "full"       # All 7 agents + NIL
    FAST      = "fast"       # Skip NIL for factual-only claims
    NIL_ONLY  = "nil_only"   # Skip debate, only NIL analysis


@dataclass
class OrchestratorConfig:
    mode: PipelineMode = PipelineMode.FULL
    max_debate_rounds: int = 2
    judge_confidence_threshold: float = 0.70   # Re-debate if Judge confidence < this
    nil_parallel: bool = True
    generate_synthetic_data: bool = False       # Enable SFT/DPO data generation
    timeout_seconds: Dict[str, int] = field(default_factory=lambda: {
        "retriever": 15,
        "proposer":  30,
        "adversary": 45,
        "nil":       60,
        "judge":     45,
        "security":   5,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Result
# ─────────────────────────────────────────────────────────────────────────────

class PipelineResult(BaseModel):
    run_id: str
    input_text: str
    verdict: str
    verdict_confidence: float
    metrics: Dict[str, float]          # BIS, PCS, EPS, NSS, CTS
    composite_score: float
    consensus_reasoning: str
    key_supporting_evidence: List[str]
    key_contradicting_evidence: List[str]
    important_caveats: List[str]
    nil_verdict: str
    nil_confidence: float
    nil_summary: str
    atomic_claims: List[Dict[str, Any]]
    missing_perspectives: List[Dict[str, Any]]
    debate_summary: str
    pipeline_latency_ms: float
    step_latencies: Dict[str, float]
    models_used: Dict[str, str]
    debate_rounds: int
    mode: str
    safe: bool
    security_warnings: List[str]


# ─────────────────────────────────────────────────────────────────────────────
# SSE Event Generator
# ─────────────────────────────────────────────────────────────────────────────

def _sse_event(event_type: str, data: Dict) -> Dict:
    return {"event": event_type, "data": data, "timestamp": time.time()}


# ─────────────────────────────────────────────────────────────────────────────
# Master Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class MasterOrchestrator:
    """
    Stateless async orchestrator. Can be called concurrently for multiple queries.
    Instantiate once; agents are lazy-loaded and persistent across calls.
    """

    def __init__(self, config: Optional[OrchestratorConfig] = None):
        self.config = config or OrchestratorConfig()

        # Lazy agent instances (persistent singletons after first call)
        self._retriever   = None
        self._proposer    = None
        self._adversary_a = None
        self._adversary_b = None
        self._nil         = None
        self._judge       = None
        self._security    = None

        logger.info(f"MasterOrchestrator ready | mode={self.config.mode}")

    # ── Agent Initialization ──────────────────────────────────────────────

    def _load_agents(self):
        """Lazy-load all agents once on first request."""
        if self._security is None:
            from achp.agents.security_validator import SecurityValidatorAgent
            from achp.agents.retriever          import RetrieverAgent
            from achp.agents.proposer           import ProposerAgent
            from achp.agents.adversary_a        import AdversaryAAgent
            from achp.agents.adversary_b        import AdversaryBAgent
            from achp.agents.nil_supervisor     import NILSupervisorAgent
            from achp.agents.judge              import JudgeAgent

            self._security    = SecurityValidatorAgent()
            self._retriever   = RetrieverAgent()
            self._proposer    = ProposerAgent()
            self._adversary_a = AdversaryAAgent()
            self._adversary_b = AdversaryBAgent()
            self._nil         = NILSupervisorAgent()
            self._judge       = JudgeAgent()
            logger.info("All 7 agents loaded and persistent")

    # ── Planning Mode: Pre-flight Routing ────────────────────────────────

    def _plan_pipeline(self, text: str) -> PipelineMode:
        """
        Internal planning mode: determine optimal pipeline route.
        Heuristic-based routing (no LLM cost).
        """
        text_lower = text.lower()

        # Opinion/prediction signals → needs strong NIL
        opinion_signals = ["i think","in my opinion","believe","feel","should","ought","must","will"]
        has_opinion = any(s in text_lower for s in opinion_signals)

        # Pure factual questions → FAST mode (skip NIL)
        factual_signals = ["what is","what are","when did","who is","define","how many","which country"]
        is_pure_factual = any(s in text_lower for s in factual_signals) and not has_opinion

        # Short text → fast mode
        if len(text.split()) < 8 and is_pure_factual:
            return PipelineMode.FAST

        return self.config.mode

    def _select_model_for_complexity(self, text: str) -> Dict[str, str]:
        """
        Dynamic model routing based on claim complexity.
        Complex claims → more capable (slower) models.
        """
        word_count = len(text.split())
        has_numbers = any(c.isdigit() for c in text)
        is_complex = word_count > 50 or has_numbers

        if is_complex:
            return {
                "proposer":    "meta-llama/llama-4-scout-17b-16e-instruct",
                "adversary_a": "deepseek/deepseek-r1",
                "adversary_b": "qwen/qwen-32b",
                "judge":       "deepseek/deepseek-chat",
            }
        return {
            "proposer":    os.getenv("PROPOSER_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
            "adversary_a": os.getenv("ADVERSARY_A_MODEL", "deepseek/deepseek-r1"),
            "adversary_b": os.getenv("ADVERSARY_B_MODEL", "qwen/qwen-32b"),
            "judge":       os.getenv("JUDGE_MODEL", "deepseek/deepseek-chat"),
        }

    # ── Main Pipeline ─────────────────────────────────────────────────────

    async def run(
        self,
        text: str,
        sse_queue: Optional[asyncio.Queue] = None,
    ) -> PipelineResult:
        """
        Execute the full ACHP pipeline for a given input text.

        Args:
            text: The claim or article to analyze.
            sse_queue: Optional async queue for Server-Sent Events.
                       Push events here for real-time UI updates.
        Returns:
            PipelineResult with all verdicts, metrics, and debate output.
        """
        run_id = str(uuid.uuid4())[:8]
        t_pipeline = time.perf_counter()
        step_latencies: Dict[str, float] = {}
        models_used: Dict[str, str] = {}
        security_warnings: List[str] = []

        async def emit(event_type: str, data: Dict):
            if sse_queue:
                await sse_queue.put(_sse_event(event_type, data))

        self._load_agents()
        mode = self._plan_pipeline(text)
        model_map = self._select_model_for_complexity(text)
        logger.info(f"[{run_id}] Pipeline start | mode={mode} | text='{text[:60]}'")

        # ── Step 1: Security Pre-check ────────────────────────────────────
        await emit("agent_status", {"agent": "security_validator", "status": "running", "step": 1})
        t0 = time.perf_counter()
        pre_check = self._security.validate_input(text)
        step_latencies["security_pre"] = (time.perf_counter() - t0) * 1000
        security_warnings.extend(pre_check.warnings)

        if not pre_check.safe:
            logger.warning(f"[{run_id}] Input blocked: {pre_check.block_reason}")
            await emit("agent_status", {"agent": "security_validator", "status": "BLOCKED"})
            return self._blocked_result(run_id, text, pre_check.block_reason or "Security check failed", step_latencies)

        await emit("agent_status", {"agent": "security_validator", "status": "done", "step": 1})

        # ── Step 2: Retriever ─────────────────────────────────────────────
        await emit("agent_status", {"agent": "retriever", "status": "running", "step": 2})
        t0 = time.perf_counter()
        try:
            retrieval = await asyncio.wait_for(
                self._retriever.retrieve(text),
                timeout=self.config.timeout_seconds["retriever"],
            )
            retrieved_docs = [d["content"] if isinstance(d, dict) else d.content for d in (retrieval.docs or [])]
        except asyncio.TimeoutError:
            logger.warning(f"[{run_id}] Retriever timed out")
            retrieved_docs = []
        step_latencies["retriever"] = (time.perf_counter() - t0) * 1000
        await emit("agent_status", {"agent": "retriever", "status": "done", "from_cache": getattr(retrieval, "from_cache", False)})

        # ── Step 3: Proposer ──────────────────────────────────────────────
        await emit("agent_status", {"agent": "proposer", "status": "running", "step": 3})
        t0 = time.perf_counter()
        analysis = await asyncio.wait_for(
            self._proposer.analyze(text, retrieved_docs),
            timeout=self.config.timeout_seconds["proposer"],
        )
        step_latencies["proposer"] = (time.perf_counter() - t0) * 1000
        models_used["proposer"] = analysis.model_used
        await emit("agent_status", {
            "agent": "proposer", "status": "done",
            "claim_type": analysis.claim_type,
            "atomic_claims": len(analysis.atomic_claims),
        })

        # ── Steps 4 & 5: Adversary A + B in parallel ─────────────────────
        await emit("agent_status", {"agent": "adversary_a", "status": "running", "step": 4})
        await emit("agent_status", {"agent": "adversary_b", "status": "running", "step": 5})
        t0 = time.perf_counter()

        adv_a_task = asyncio.create_task(
            asyncio.wait_for(self._adversary_a.challenge(analysis), timeout=self.config.timeout_seconds["adversary"])
        )
        adv_b_task = asyncio.create_task(
            asyncio.wait_for(self._adversary_b.audit(analysis), timeout=self.config.timeout_seconds["adversary"])
        )
        adversary_a_report, adversary_b_report = await asyncio.gather(adv_a_task, adv_b_task)
        step_latencies["debate_parallel"] = (time.perf_counter() - t0) * 1000
        models_used["adversary_a"] = adversary_a_report.model_used
        models_used["adversary_b"] = adversary_b_report.model_used
        await emit("agent_status", {"agent": "adversary_a", "status": "done", "factual_score": adversary_a_report.overall_factual_score})
        await emit("agent_status", {"agent": "adversary_b", "status": "done", "pcs": adversary_b_report.perspective_completeness_score})

        # ── Step 6: NIL Supervisor (5 sub-agents parallel) ────────────────
        nil_report = None
        if mode != PipelineMode.FAST:
            await emit("agent_status", {"agent": "nil_supervisor", "status": "running", "step": 6})
            t0 = time.perf_counter()
            nil_report = await asyncio.wait_for(
                self._nil.run(text, context="\n".join(retrieved_docs[:2])),
                timeout=self.config.timeout_seconds["nil"],
            )
            step_latencies["nil"] = (time.perf_counter() - t0) * 1000
            await emit("agent_status", {
                "agent": "nil_supervisor", "status": "done",
                "nil_verdict": nil_report.nil_verdict,
                "nil_confidence": nil_report.nil_confidence,
            })

        # Fallback NIL if skipped
        if nil_report is None:
            from achp.agents.nil_supervisor import NILReport
            nil_report = NILReport(nil_verdict="skipped", nil_summary="NIL skipped in FAST mode")

        # ── Step 7: Judge ─────────────────────────────────────────────────
        await emit("agent_status", {"agent": "judge", "status": "running", "step": 7})
        t0 = time.perf_counter()
        debate_round = 1

        verdict = await asyncio.wait_for(
            self._judge.judge(analysis, adversary_a_report, adversary_b_report, nil_report),
            timeout=self.config.timeout_seconds["judge"],
        )

        # Conditional escalation: re-debate if confidence too low
        while (verdict.verdict_confidence < self.config.judge_confidence_threshold
               and debate_round < self.config.max_debate_rounds):
            debate_round += 1
            logger.info(f"[{run_id}] Low Judge confidence ({verdict.verdict_confidence:.2f}), re-debating round {debate_round}")
            await emit("agent_status", {"agent": "judge", "status": "re_debating", "round": debate_round})
            adversary_a_report = await self._adversary_a.challenge(analysis, debate_round=debate_round)
            verdict = await self._judge.judge(analysis, adversary_a_report, adversary_b_report, nil_report)

        step_latencies["judge"] = (time.perf_counter() - t0) * 1000
        models_used["judge"] = verdict.model_used
        await emit("agent_status", {
            "agent": "judge", "status": "done",
            "verdict": verdict.verdict,
            "CTS": verdict.metrics.CTS,
        })

        # ── Step 8: Security Post-check ───────────────────────────────────
        t0 = time.perf_counter()
        output_text = verdict.consensus_reasoning + " " + verdict.debate_summary
        post_check = self._security.validate_output(output_text)
        step_latencies["security_post"] = (time.perf_counter() - t0) * 1000
        security_warnings.extend(post_check.warnings)

        # ── Assemble result ───────────────────────────────────────────────
        pipeline_latency = (time.perf_counter() - t_pipeline) * 1000

        result = PipelineResult(
            run_id=run_id,
            input_text=text,
            verdict=verdict.verdict,
            verdict_confidence=verdict.verdict_confidence,
            metrics=verdict.metrics.model_dump(),
            composite_score=round(verdict.metrics.composite, 4),
            consensus_reasoning=verdict.consensus_reasoning,
            key_supporting_evidence=verdict.key_supporting_evidence,
            key_contradicting_evidence=verdict.key_contradicting_evidence,
            important_caveats=verdict.important_caveats,
            nil_verdict=nil_report.nil_verdict,
            nil_confidence=nil_report.nil_confidence,
            nil_summary=nil_report.nil_summary,
            atomic_claims=[c.model_dump() for c in analysis.atomic_claims],
            missing_perspectives=[p.model_dump() for p in adversary_b_report.missing_perspectives],
            debate_summary=verdict.debate_summary,
            pipeline_latency_ms=round(pipeline_latency, 2),
            step_latencies={k: round(v, 2) for k, v in step_latencies.items()},
            models_used=models_used,
            debate_rounds=debate_round,
            mode=mode.value,
            safe=post_check.safe,
            security_warnings=security_warnings,
        )

        await emit("pipeline_complete", {"run_id": run_id, "verdict": verdict.verdict, "latency_ms": pipeline_latency})
        logger.info(f"[{run_id}] Pipeline complete | {verdict.verdict} | {pipeline_latency:.0f}ms | {debate_round} debate round(s)")

        # Optional: generate synthetic training data
        if self.config.generate_synthetic_data:
            asyncio.create_task(self._generate_training_pair(result))

        return result

    async def run_stream(self, text: str) -> AsyncGenerator[Dict, None]:
        """Streaming version: yields SSE events as pipeline progresses."""
        queue: asyncio.Queue = asyncio.Queue()
        pipeline_task = asyncio.create_task(self.run(text, sse_queue=queue))
        sentinel = object()

        async def _finish():
            await pipeline_task
            await queue.put(sentinel)

        asyncio.create_task(_finish())

        while True:
            event = await queue.get()
            if event is sentinel:
                break
            yield event

        if pipeline_task.exception():
            raise pipeline_task.exception()

    # ── Helpers ───────────────────────────────────────────────────────────

    def _blocked_result(self, run_id: str, text: str, reason: str, latencies: Dict) -> PipelineResult:
        return PipelineResult(
            run_id=run_id, input_text=text,
            verdict="BLOCKED", verdict_confidence=1.0,
            metrics={"BIS":0,"PCS":0,"EPS":0,"NSS":0,"CTS":0},
            composite_score=0.0,
            consensus_reasoning=f"Input blocked by Security Validator: {reason}",
            key_supporting_evidence=[], key_contradicting_evidence=[],
            important_caveats=[reason],
            nil_verdict="blocked", nil_confidence=0.0, nil_summary="",
            atomic_claims=[], missing_perspectives=[],
            debate_summary="", pipeline_latency_ms=0.0,
            step_latencies=latencies, models_used={},
            debate_rounds=0, mode="blocked", safe=False,
            security_warnings=[reason],
        )

    async def _generate_training_pair(self, result: PipelineResult):
        """
        Post-training: generate SFT/DPO training pair from pipeline output.
        Runs asynchronously after returning result to user.
        """
        try:
            from achp.data.synthetic_generator import SyntheticDataGenerator
            gen = SyntheticDataGenerator()
            await gen.generate_from_result(result)
        except Exception as e:
            logger.debug(f"Synthetic data generation failed (non-critical): {e}")

    async def health_check(self) -> Dict[str, Any]:
        self._load_agents()
        return {
            "status": "ok",
            "agents": {
                "retriever":          "persistent",
                "proposer":           "persistent",
                "adversary_a":        "persistent",
                "adversary_b":        "persistent",
                "nil_supervisor":     "persistent",
                "judge":              "persistent",
                "security_validator": "persistent",
            },
            "nil_sub_agents": ["sentiment","bias","perspective","framing","synthesizer"],
            "config": {
                "mode": self.config.mode,
                "max_debate_rounds": self.config.max_debate_rounds,
                "judge_confidence_threshold": self.config.judge_confidence_threshold,
            },
        }

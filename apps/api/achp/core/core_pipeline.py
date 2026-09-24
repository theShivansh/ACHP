"""
ACHP — Core Pipeline  (core_pipeline.py)
==========================================
Single source of truth connecting the logical agents. Seven logical agents, three Groq calls:

  User Query
      │
  [1] SecurityValidator.validate_input()                 sync, no model
      │
  [2] RetrieverAgent.retrieve() → EvidencePack           server-side tools (KB + web), ids e1…
      │
  [3] ProposerAgent.run()                                Groq call 1  (proposer)
      │
  [4] AnalysisBundleAgent.run()  ┐                       Groq call 2  (Adversary A + B + NIL signals)
  [5] NILLayer.prepare()         ┘ parallel              local (VADER, framing embeddings)
      │  NILLayer.finalize()                             deterministic synthesis
  [6] JudgeAgent.run()                                   Groq call 3  (+ bundle/judge again if the
      │                                                  Judge asks for a second round)
  [7] grounding (inside each agent): unknown evidence ids, non-verbatim quotes and foreign URLs are
      │  removed; ungrounded verdicts become UNVERIFIABLE
  [8] metrics (formulas below) · SecurityValidator.validate_output()
      │
  ACHPOutput (exact format; new fields additive)

Every model call goes through achp.llm.runtime.GroqRuntime (one client, queue, retries,
Retry-After, circuit breaker, primary→fallback per achp.llm.registry). A stage that can't get an
answer raises PipelineError; the pipeline never substitutes a made-up result.

═══════════════════════════════════════════════════════════════════
EXACT METRIC FORMULAS
═══════════════════════════════════════════════════════════════════

  CTS  =  0.40·factual_score_A  +  0.35·judge_CTS_raw      [Consensus Truth]
         +  0.15·(1 − BIS)  +  0.10·EPS

  PCS  =  0.50·pcs_llm_B  +  0.30·nil_pcs               [Perspective Complete]
         +  0.20·(missing_per  > 0 ? 1−missing_per/10 : 1)

  BIS  =  0.55·nil_bis  +  0.25·framing_score            [Bias Impact]
         +  0.12·polarity_abs  +  framing_boost(0/0.05/0.15)

  NSS  =  0.40·(1−framing_score)  +  0.35·narrative_alignment  [Narrative Stance]
         +  0.25·judge_NSS_raw

  EPS  =  0.70·vader_eps  +  0.20·(1−framing_score)      [Epistemic Position]
         +  0.10·hedge_ratio×3

  composite  =  (CTS + PCS + (1−BIS) + NSS + EPS) / 5

═══════════════════════════════════════════════════════════════════
FINAL OUTPUT FORMAT (exact)
═══════════════════════════════════════════════════════════════════

{
  "run_id":               "abc12345",
  "timestamp":            "2026-04-06T17:30:00Z",
  "input":                "original claim text",
  "verdict":              "MOSTLY_TRUE",
  "verdict_confidence":   0.82,
  "composite_score":      0.76,
  "metrics": {
    "CTS": 0.78,   // Consensus Truth Score
    "PCS": 0.80,   // Perspective Completeness Score
    "BIS": 0.15,   // Bias Impact Score (lower = less bias)
    "NSS": 0.82,   // Narrative Stance Score
    "EPS": 0.85    // Epistemic Position Score
  },
  "nil": {
    "verdict":     "neutral",
    "confidence":  0.18,
    "summary":     "..."
  },
  "atomic_claims": [...],
  "adversary_a": { "factual_score": 0.78, "critical_flaws": [...] },
  "adversary_b": { "perspective_score": 0.80, "missing_perspectives": [...] },
  "consensus_reasoning":  "...",
  "key_evidence": {
    "supporting":     [...],
    "contradicting":  [...]
  },
  "caveats":       [...],
  "debate_rounds": 1,
  "pipeline": {
    "mode":     "full",
    "latency_ms": { ... },
    "models":   { ... },
    "cache_hit": false
  },
  "security": {
    "pre_safe":    true,
    "post_safe":   true,
    "warnings":    []
  }
}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Protocol

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Exact Metric Formulas
# ─────────────────────────────────────────────────────────────────────────────

def compute_CTS(
    factual_score_a: float,   # AdversaryA.overall_factual_score
    judge_cts_raw:  float,    # Judge raw CTS (0-1)
    bis:            float,    # computed BIS
    eps:            float,    # computed EPS
) -> float:
    """CTS = 0.40·factual_A + 0.35·judge_CTS + 0.15·(1−BIS) + 0.10·EPS"""
    return round(min(1.0, max(0.0,
        0.40 * factual_score_a +
        0.35 * judge_cts_raw   +
        0.15 * (1.0 - bis)     +
        0.10 * eps
    )), 4)


def compute_PCS(
    pcs_llm_b:    float,   # AdversaryB.perspective_completeness_score
    nil_pcs:      float,   # NIL PCS (from synthesizer)
    missing_n:    int,     # number of missing perspectives found
) -> float:
    """PCS = 0.50·pcs_B + 0.30·nil_pcs + 0.20·(1 − min(missing/10, 1))"""
    missing_penalty = min(1.0, missing_n / 10)
    return round(min(1.0, max(0.0,
        0.50 * pcs_llm_b          +
        0.30 * nil_pcs             +
        0.20 * (1.0 - missing_penalty)
    )), 4)


def compute_BIS(
    nil_bis:        float,   # NIL BiasDeepSeek BIS
    framing_score:  float,   # NIL FramingCosine framing_score
    polarity_abs:   float,   # |VADER compound|
    dominant_frame: str,     # e.g. "delegitimize"
) -> float:
    """BIS = 0.55·nil_bis + 0.25·framing + 0.12·polarity + boost"""
    boost = 0.15 if dominant_frame in ("delegitimize","conspiracy") else \
            0.05 if dominant_frame in ("alarm",) else 0.0
    return round(min(1.0, max(0.0,
        0.55 * nil_bis      +
        0.25 * framing_score +
        0.12 * polarity_abs  +
        boost
    )), 4)


def compute_NSS(
    framing_score:       float,   # NIL framing_score
    narrative_alignment: float,   # Judge raw NSS
    judge_nss_raw:       float,   # from Judge metrics
) -> float:
    """NSS = 0.40·(1−framing) + 0.35·alignment + 0.25·judge_NSS"""
    return round(min(1.0, max(0.0,
        0.40 * (1.0 - framing_score)   +
        0.35 * narrative_alignment      +
        0.25 * judge_nss_raw
    )), 4)


def compute_EPS(
    vader_eps:     float,   # SentimentEPS.EPS
    framing_score: float,   # NIL framing_score
    hedge_ratio:   float,   # from VADER analysis
) -> float:
    """EPS = 0.70·vader_eps + 0.20·(1−framing) + 0.10·min(hedge_ratio×3, 1)"""
    return round(min(1.0, max(0.0,
        0.70 * vader_eps              +
        0.20 * (1.0 - framing_score)   +
        0.10 * min(1.0, hedge_ratio * 3)
    )), 4)


def compute_composite(CTS: float, PCS: float, BIS: float, NSS: float, EPS: float) -> float:
    """composite = (CTS + PCS + (1−BIS) + NSS + EPS) / 5"""
    return round((CTS + PCS + (1.0 - BIS) + NSS + EPS) / 5, 4)


def verdict_from_composite(composite: float, judge_verdict: str) -> tuple[str, float]:
    """
    Trust the Judge verdict primarily, use composite to calibrate confidence.
    Returns (verdict_string, confidence_float).
    """
    SCALE = [
        (0.85, "TRUE"),
        (0.70, "MOSTLY_TRUE"),
        (0.50, "MIXED"),
        (0.30, "MOSTLY_FALSE"),
        (0.00, "FALSE"),
    ]
    # If judge returned UNVERIFIABLE, trust it
    if judge_verdict == "UNVERIFIABLE":
        return "UNVERIFIABLE", max(0.5, composite)
    # Otherwise blend judge with composite
    composite_verdict = "FALSE"
    for threshold, label in SCALE:
        if composite >= threshold:
            composite_verdict = label
            break
    # If both agree, high confidence
    if composite_verdict == judge_verdict:
        confidence = min(0.98, composite + 0.08)
    else:
        # Partial agreement — average the two signals
        confidence = max(0.45, composite)
    return judge_verdict, round(confidence, 4)


# ─────────────────────────────────────────────────────────────────────────────
# ACHP Output Schema (exact; new fields are additive)
# ─────────────────────────────────────────────────────────────────────────────

class ACHPOutput(BaseModel):
    run_id:             str
    timestamp:          str
    input:              str
    verdict:            str
    verdict_confidence: float = Field(ge=0.0, le=1.0)
    composite_score:    float = Field(ge=0.0, le=1.0)
    metrics: Dict[str, float]      # CTS, PCS, BIS, NSS, EPS
    nil: Dict[str, Any]
    atomic_claims: List[Dict[str, Any]]
    adversary_a: Dict[str, Any]
    adversary_b: Dict[str, Any]
    consensus_reasoning: str
    key_evidence: Dict[str, List[str]]  # supporting, contradicting (rendered from the evidence pack)
    caveats:      List[str]
    debate_rounds: int
    pipeline: Dict[str, Any]    # mode, latency_ms, models, cache_hit, llm_calls, grounding, prompt_version
    security: Dict[str, Any]    # pre_safe, post_safe, warnings
    evidence: List[Dict[str, Any]] = []       # the run's evidence pack (ids referenced everywhere)
    claim_labels: List[Dict[str, Any]] = []   # Judge's per-part labels with evidence ids


class PipelineError(RuntimeError):
    """A stage failed and the run can't honestly produce a verdict."""

    def __init__(self, stage: str, code: str, message: str, retryable: bool = True):
        super().__init__(f"{stage}: {code}: {message}")
        self.stage = stage
        self.code = code
        self.message = message
        self.retryable = retryable


# ─────────────────────────────────────────────────────────────────────────────
# Core Pipeline
# ─────────────────────────────────────────────────────────────────────────────

class CorePipeline:
    """
    Wired end-to-end ACHP pipeline: 3 Groq calls per run (4-5 with a second round).

    `offline=True` is kept as a constructor argument for compatibility, but there is no longer a
    mock pipeline: without GROQ_API_KEY a run fails with PipelineError instead of inventing a
    verdict (non-negotiable 4). Demo data lives only in the web app's `?demo=1` mode.
    """

    JUDGE_CONFIDENCE_THRESHOLD = 0.70
    MAX_DEBATE_ROUNDS          = int(os.getenv("ACHP_MAX_DEBATE_ROUNDS", 2))
    RETRIEVER_TIMEOUT_S        = float(os.getenv("ACHP_RETRIEVER_TIMEOUT_S", 20))

    def __init__(self, offline: bool = False, runtime: Any = None):
        self.offline = offline
        self._runtime = runtime
        self._security = None
        self._retriever = None
        self._proposer = None
        self._bundle = None
        self._nil = None
        self._judge = None
        logger.info(f"CorePipeline init | offline={offline}")

    # ── Agent Loading ──────────────────────────────────────────────────────

    def _get_security(self):
        if self._security is None:
            from achp.agents.security_validator import SecurityValidatorAgent
            self._security = SecurityValidatorAgent()
        return self._security

    def _get_nil(self):
        if self._nil is None:
            from achp.nil.nil_layer import NILLayer
            self._nil = NILLayer()
        return self._nil

    def _load_agents(self):
        if self._proposer is not None:
            return
        from achp.agents.analysis_bundle import AnalysisBundleAgent
        from achp.agents.judge import JudgeAgent
        from achp.agents.proposer import ProposerAgent
        from achp.agents.retriever import RetrieverAgent
        self._retriever = RetrieverAgent()
        self._proposer = ProposerAgent(self._runtime)
        self._bundle = AnalysisBundleAgent(self._runtime)
        self._judge = JudgeAgent(self._runtime)
        logger.info("Agents loaded: retriever, proposer, analysis bundle (A+B+NIL), judge")

    def _plan(self, text: str) -> str:
        words = text.lower().split()
        if len(words) < 8 and any(w in text.lower() for w in ["what is", "when did", "who is", "define"]):
            return "fast"
        return "full"

    # ── Main Entry Point ──────────────────────────────────────────────────

    async def run(
        self,
        text: str,
        sse_queue: Optional[asyncio.Queue] = None,
        extra_context: Optional[List[str]] = None,
        *,
        kb_chunks: Optional[List[Dict[str, Any]]] = None,
        kb_id: Optional[str] = None,
        kb_name: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> ACHPOutput:
        """Run the pipeline on the claim `text`. Library chunks travel separately in `kb_chunks`
        (never pasted into the claim), so security, retrieval and NIL all see only the claim."""
        from achp.llm.runtime import LLMUnavailable
        from achp.memory.run_memory import RequestMemory, RunMemory
        from achp.prompts.contract import PROMPT_VERSION

        run_id = run_id or uuid.uuid4().hex[:8]
        t_start = time.perf_counter()
        latencies: Dict[str, float] = {}
        warnings: List[str] = []
        mem = RunMemory(run_id, RequestMemory(
            text=text, kb_id=kb_id, kb_name=kb_name,
            kb_chunks=tuple(kb_chunks or ()), extra_context=tuple(extra_context or ()),
        ))

        async def emit(event: str, data: Dict):
            if sse_queue:
                await sse_queue.put({"event": event, "data": data, "ts": time.time()})

        mode = self._plan(text)

        # ── 1. Security pre-check (no model call) ────────────────────────
        await emit("agent_status", {"agent": "security_validator", "status": "running", "step": 1})
        t0 = time.perf_counter()
        sv = self._get_security()
        pre = sv.validate_input(text)
        latencies["security_pre"] = (time.perf_counter() - t0) * 1000
        warnings.extend(pre.warnings)
        if not pre.safe:
            logger.warning(f"[{run_id}] BLOCKED: {pre.block_reason}")
            return self._blocked(run_id, text, pre.block_reason or "Security pre-check failed")
        await emit("agent_status", {"agent": "security_validator", "status": "done"})

        if self.offline or not os.getenv("GROQ_API_KEY", "").strip() and self._runtime is None:
            raise PipelineError("config", "no_api_key",
                                "GROQ_API_KEY is not configured, so no claim can be checked.",
                                retryable=False)
        self._load_agents()

        stage = "retriever"
        try:
            # ── 2. Retriever → evidence pack (server-side tools) ────────────
            await emit("agent_status", {"agent": "retriever", "status": "running", "step": 2})
            t0 = time.perf_counter()
            try:
                retrieval = await asyncio.wait_for(
                    self._retriever.retrieve(
                        text, kb_chunks=list(kb_chunks or []), kb_name=kb_name,
                        extra_context=list(extra_context or []),
                    ),
                    timeout=self.RETRIEVER_TIMEOUT_S,
                )
                mem.evidence = retrieval.pack
                cache_hit = retrieval.from_cache
            except asyncio.TimeoutError:
                from achp.evidence.pack import EvidencePack
                logger.warning(f"[{run_id}] Retriever timed out; continuing with library evidence only")
                warnings.append("Web search timed out; only library sources were used.")
                mem.evidence = EvidencePack.build(text, kb_chunks=kb_chunks or [], kb_name=kb_name,
                                                  context=extra_context or [])
                cache_hit = False
            mem.models["retriever"] = "ddgs+bm25"
            latencies["retriever"] = (time.perf_counter() - t0) * 1000
            await emit("agent_status", {"agent": "retriever", "status": "done",
                                        "from_cache": cache_hit, "evidence": len(mem.evidence)})

            # ── 3. Proposer (Groq call 1) ─────────────────────────────────
            await emit("agent_status", {"agent": "proposer", "status": "running", "step": 3})
            t0 = time.perf_counter()
            stage = "proposer"
            mem.analysis, res = await self._proposer.run(text, mem.evidence, run_id=run_id)
            mem.record_call("proposer", res)
            mem.models["proposer"] = res.model
            latencies["proposer"] = (time.perf_counter() - t0) * 1000
            await emit("agent_status", {"agent": "proposer", "status": "done",
                                        "claim_type": mem.analysis.claim_type,
                                        "num_claims": len(mem.analysis.atomic_claims)})

            # ── 4+5+6. Analysis bundle (Groq call 2) ∥ NIL local checks ───
            for step, agent in ((4, "adversary_a"), (5, "adversary_b"), (6, "nil_supervisor")):
                await emit("agent_status", {"agent": agent, "status": "running", "step": step})
            t0 = time.perf_counter()
            stage = "analysis"
            nil = self._get_nil()
            bundle, prepared = await asyncio.gather(
                self._bundle.run(text, mem.analysis, mem.evidence, run_id=run_id),
                nil.prepare(text),
            )
            mem.record_call("analysis", bundle.llm)
            mem.add_grounding(bundle.grounding)
            mem.adversary_a, mem.adversary_b, mem.signals = bundle.adversary_a, bundle.adversary_b, bundle.signals
            nil_result = await nil.finalize(prepared, bundle.signals)
            mem.nil = nil_result
            latencies["debate_nil_parallel"] = (time.perf_counter() - t0) * 1000
            for agent in ("adversary_a", "adversary_b"):
                mem.models[agent] = bundle.llm.model
            mem.models["nil"] = f"vader+{os.getenv('NIL_EMBED_MODEL', 'paraphrase-MiniLM-L3-v2')}+{bundle.llm.model}"
            await emit("agent_status", {"agent": "adversary_a", "status": "done",
                                        "factual_score": mem.adversary_a.overall_factual_score})
            await emit("agent_status", {"agent": "adversary_b", "status": "done",
                                        "pcs": mem.adversary_b.perspective_completeness_score})
            await emit("agent_status", {"agent": "nil_supervisor", "status": "done",
                                        "nil_verdict": nil_result.nil_verdict})

            # ── Signals for the formulas ──────────────────────────────────
            nil_s = nil_result.sentiment.data
            nil_f = nil_result.framing.data
            framing_sc = nil_result.framing_score
            dominant_frame = nil_f.get("dominant_frame", "neutral")
            polarity_abs = abs(nil_s.get("polarity", 0.0))
            hedge_ratio = nil_s.get("hedge_ratio", 0.0)
            vader_eps = nil_s.get("EPS", 0.5)

            # Adversary override: a strongly refuted claim (factual < 0.20, which grounding only
            # allows with cited counter-evidence) can't be read as "neutral" wording.
            if mem.adversary_a.overall_factual_score < 0.20:
                nil_result.nil_verdict = "misleading"
                nil_result.nil_confidence = max(nil_result.nil_confidence, 0.46)
                nil_result.BIS = max(nil_result.BIS, 0.30)
                framing_sc = max(framing_sc, 0.15)
                dominant_frame = dominant_frame if dominant_frame != "neutral" else "alarm"

            # ── 7. Judge (Groq call 3, a second round only when asked) ────
            await emit("agent_status", {"agent": "judge", "status": "running", "step": 7})
            t0 = time.perf_counter()
            stage = "judge"
            debate_round = 1
            judge, dropped, res = await self._judge.run(
                mem.analysis, mem.adversary_a, mem.adversary_b, nil_result, mem.evidence, run_id=run_id)
            mem.record_call("judge", res)
            mem.add_grounding(dropped)
            while (judge.needs_second_round
                   and judge.verdict_confidence < self.JUDGE_CONFIDENCE_THRESHOLD
                   and debate_round < self.MAX_DEBATE_ROUNDS):
                debate_round += 1
                await emit("agent_status", {"agent": "judge", "status": "re_debating", "round": debate_round,
                                            "reason": judge.second_round_reason or ""})
                logger.info(f"[{run_id}] Judge asked for round {debate_round}: {judge.second_round_reason}")
                stage = "analysis"
                bundle2 = await self._bundle.run(text, mem.analysis, mem.evidence, debate_round=debate_round,
                                                 judge_question=judge.second_round_reason, run_id=run_id)
                mem.record_call("analysis", bundle2.llm)
                mem.add_grounding(bundle2.grounding)
                mem.adversary_a = bundle2.adversary_a
                stage = "judge"
                judge, dropped, res = await self._judge.run(
                    mem.analysis, mem.adversary_a, mem.adversary_b, nil_result, mem.evidence, run_id=run_id)
                mem.record_call("judge", res)
                mem.add_grounding(dropped)
            mem.judge = judge
            mem.models["judge"] = res.model
            latencies["judge"] = (time.perf_counter() - t0) * 1000
            await emit("agent_status", {"agent": "judge", "status": "done", "verdict": judge.verdict})
        except LLMUnavailable as e:
            logger.error(f"[{run_id}] {stage} failed: {e}")
            raise PipelineError(stage, e.code, e.message, e.retryable) from e

        # ── Metrics (formulas above, pinned by the Assay parity tests) ───────
        BIS = compute_BIS(nil_result.BIS, framing_sc, polarity_abs, dominant_frame)
        EPS = compute_EPS(vader_eps, framing_sc, hedge_ratio)
        CTS = compute_CTS(mem.adversary_a.overall_factual_score, judge.metrics.CTS, BIS, EPS)
        PCS = compute_PCS(
            mem.adversary_b.perspective_completeness_score,
            nil_result.PCS,
            len(mem.adversary_b.missing_perspectives),
        )
        NSS = compute_NSS(
            framing_sc,
            1.0 - framing_sc,
            judge.metrics.NSS if judge.metrics else NSS_proxy(BIS, framing_sc),
        )
        composite = compute_composite(CTS, PCS, BIS, NSS, EPS)
        verdict, confidence = verdict_from_composite(composite, judge.verdict)

        # ── 8. Security post-check ────────────────────────────────────────
        t0 = time.perf_counter()
        post = sv.validate_output(judge.consensus_reasoning)
        latencies["security_post"] = (time.perf_counter() - t0) * 1000
        warnings.extend(post.warnings)
        total_latency = (time.perf_counter() - t_start) * 1000

        a, b = mem.adversary_a, mem.adversary_b
        output = ACHPOutput(
            run_id=run_id,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            input=text,
            verdict=verdict,
            verdict_confidence=confidence,
            composite_score=composite,
            metrics={"CTS": CTS, "PCS": PCS, "BIS": BIS, "NSS": NSS, "EPS": EPS},
            nil={
                "verdict":    nil_result.nil_verdict,
                "confidence": nil_result.nil_confidence,
                "summary":    nil_result.nil_summary,
                "BIS":        nil_result.BIS,
                "EPS":        nil_result.EPS,
                "PCS":        nil_result.PCS,
            },
            atomic_claims=[c.model_dump() for c in mem.analysis.atomic_claims],
            adversary_a={
                "factual_score":  a.overall_factual_score,
                "critical_flaws": a.critical_flaws,
                "verdict":        "refuted" if a.overall_factual_score < 0.3 else "contested",
                "challenges":     [c.model_dump() for c in a.challenges],
                "flaws":          a.flaws,
                "public_note":    a.public_note,
            },
            adversary_b={
                "perspective_score":    b.perspective_completeness_score,
                "missing_perspectives": [p.model_dump() for p in b.missing_perspectives],
                "narrative_stance":     b.narrative_stance,
                "flaws":                b.flaws,
                "public_note":          b.public_note,
            },
            consensus_reasoning=judge.consensus_reasoning,
            key_evidence={
                "supporting":    judge.key_supporting_evidence,
                "contradicting": judge.key_contradicting_evidence,
            },
            caveats=judge.important_caveats,
            debate_rounds=debate_round,
            pipeline={
                "mode":           mode,
                "latency_ms":     {k: round(v, 2) for k, v in latencies.items()},
                "total_ms":       round(total_latency, 2),
                "models":         mem.models,
                "cache_hit":      cache_hit,
                "groq_calls":     len(mem.llm_calls),
                "llm_calls":      mem.llm_calls,
                "grounding":      dict(mem.grounding),
                "prompt_version": PROMPT_VERSION,
                "evidence_count": len(mem.evidence),
                "evidence_oldest_retrieved_at": mem.evidence.oldest_retrieved_at(),
            },
            security={
                "pre_safe":  pre.safe,
                "post_safe": post.safe,
                "warnings":  warnings,
            },
            evidence=mem.evidence.to_dicts(),
            claim_labels=judge.claims,
        )

        await emit("pipeline_complete", {
            "run_id":    run_id,
            "verdict":   verdict,
            "composite": composite,
            "latency_ms": total_latency,
        })
        logger.info(
            f"[{run_id}] DONE | {verdict} ({confidence:.0%}) | "
            f"CTS={CTS:.2f} PCS={PCS:.2f} BIS={BIS:.2f} NSS={NSS:.2f} EPS={EPS:.2f} | "
            f"{total_latency:.0f}ms | groq_calls={len(mem.llm_calls)} | rounds={debate_round}"
        )
        return output

    def _blocked(self, run_id: str, text: str, reason: str) -> ACHPOutput:
        z = {"CTS": 0.0, "PCS": 0.0, "BIS": 1.0, "NSS": 0.0, "EPS": 0.0}
        return ACHPOutput(
            run_id=run_id, timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            input=text, verdict="BLOCKED", verdict_confidence=1.0, composite_score=0.0,
            metrics=z,
            nil={"verdict": "blocked", "confidence": 0.0, "summary": ""},
            atomic_claims=[], adversary_a={}, adversary_b={},
            consensus_reasoning=f"BLOCKED: {reason}",
            key_evidence={"supporting": [], "contradicting": []},
            caveats=[reason], debate_rounds=0,
            pipeline={"mode": "blocked", "latency_ms": {}, "total_ms": 0, "models": {}, "cache_hit": False,
                      "groq_calls": 0},
            security={"pre_safe": False, "post_safe": True, "warnings": [reason]},
        )

    async def run_stream(self, text: str) -> AsyncGenerator[Dict, None]:
        q: asyncio.Queue = asyncio.Queue()
        sentinel = object()

        async def _run():
            try:
                await self.run(text, sse_queue=q)
            finally:
                await q.put(sentinel)

        task = asyncio.create_task(_run())
        while True:
            ev = await q.get()
            if ev is sentinel:
                break
            yield ev
        await task


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def NSS_proxy(bis: float, framing: float) -> float:
    """NSS proxy when Judge doesn't return NSS."""
    return round(max(0.0, 1.0 - 0.6*bis - 0.4*framing), 4)

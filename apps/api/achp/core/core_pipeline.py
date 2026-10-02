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
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol

from pydantic import BaseModel, Field

from achp.assay.emit import assay_payload, build_signals
from achp.events.consistency import reconcile_judge

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
        events: Optional[Any] = None,
        extra_context: Optional[List[str]] = None,
        *,
        kb_chunks: Optional[List[Dict[str, Any]]] = None,
        kb_search: Optional[Callable[[], Awaitable[List[Dict[str, Any]]]]] = None,
        kb_id: Optional[str] = None,
        kb_name: Optional[str] = None,
        run_id: Optional[str] = None,
        fail_at: Optional[str] = None,
    ) -> ACHPOutput:
        """Run the pipeline on the claim `text`.

        Library chunks travel separately (`kb_chunks`, or `kb_search` to run the library search
        inside the retriever lane), never pasted into the claim, so security, retrieval and NIL all
        see only the claim. `events` is a RunEvents (achp.events); every step emits through it, and
        without one the calls are no-ops. `fail_at` makes that stage fail on purpose (the fixture
        recorder's `--fail-at`, enabled only with ACHP_ALLOW_FAULT_INJECTION=1 at the API).
        """
        from achp.events import notes
        from achp.events.emitter import RunEvents
        from achp.llm.runtime import LLMUnavailable
        from achp.memory.run_memory import RequestMemory, RunMemory
        from achp.prompts.contract import PROMPT_VERSION

        ev = events if events is not None else RunEvents()
        run_id = run_id or uuid.uuid4().hex[:8]
        t_start = time.perf_counter()
        latencies: Dict[str, float] = {}
        warnings: List[str] = []
        mem = RunMemory(run_id, RequestMemory(
            text=text, kb_id=kb_id, kb_name=kb_name,
            kb_chunks=tuple(kb_chunks or ()), extra_context=tuple(extra_context or ()),
        ))

        def injected(stage: str) -> None:
            if fail_at == stage:
                raise PipelineError(stage, "injected_failure",
                                    f"Failure injected at the {stage} step by the fixture recorder.", True)

        mode = self._plan(text)
        await ev.run_started(text, kb_id=kb_id, kb_name=kb_name, pipeline_mode=mode,
                             prompt_version=PROMPT_VERSION)

        # ── 1. Security pre-check (no model call) ────────────────────────
        await ev.started("security_validator")
        await ev.action("security_validator", "validate", "Checking for unsafe content")
        t0 = time.perf_counter()
        sv = self._get_security()
        pre = sv.validate_input(text)
        latencies["security_pre"] = (time.perf_counter() - t0) * 1000
        warnings.extend(pre.warnings)
        await ev.note("security_validator", None, notes.gatekeeper_note(pre.safe))
        if not pre.safe:
            logger.warning(f"[{run_id}] BLOCKED: {pre.block_reason}")
            await ev.done("security_validator", "Blocked: not safe to check", {"warnings": len(pre.warnings)})
            for agent in ("retriever", "proposer", "adversary_a", "adversary_b", "nil_supervisor", "judge"):
                await ev.skipped(agent, "blocked")
            out = self._blocked(run_id, text, pre.block_reason or "Security pre-check failed")
            await ev.verdict_final(judge_verdict="BLOCKED", judge_confidence=1.0,
                                   summary="Not checked: this message can't be checked safely.",
                                   claims=[], challenger={}, metrics=None)
            return out
        await ev.done("security_validator", "Safe to check", {"warnings": len(pre.warnings)})

        if self.offline or not os.getenv("GROQ_API_KEY", "").strip() and self._runtime is None:
            raise PipelineError("config", "no_api_key",
                                "GROQ_API_KEY is not configured, so no claim can be checked.",
                                retryable=False)
        self._load_agents()

        stage = "retriever"
        try:
            # ── 2. Retriever → evidence pack (server-side tools) ────────────
            await ev.started("retriever")
            injected("retriever")
            t0 = time.perf_counter()
            if kb_search is not None:
                await ev.action("retriever", "search_kb", "Searching your library", kb_name or kb_id)
                kb_chunks = list(await kb_search())
                mem.request = RequestMemory(text=text, kb_id=kb_id, kb_name=kb_name, kb_chunks=tuple(kb_chunks),
                                            extra_context=tuple(extra_context or ()))

            async def on_action(action: str, label: str, detail: str) -> None:
                await ev.action("retriever", action, label, detail)

            try:
                retrieval = await asyncio.wait_for(
                    self._retriever.retrieve(
                        text, kb_chunks=list(kb_chunks or []), kb_name=kb_name,
                        extra_context=list(extra_context or []), on_action=on_action,
                    ),
                    timeout=self.RETRIEVER_TIMEOUT_S,
                )
                mem.evidence = retrieval.pack
                cache_hit = retrieval.from_cache
                timed_out = False
            except asyncio.TimeoutError:
                from achp.evidence.pack import EvidencePack
                logger.warning(f"[{run_id}] Retriever timed out; continuing with library evidence only")
                warnings.append("Web search timed out; only library sources were used.")
                mem.evidence = EvidencePack.build(text, kb_chunks=kb_chunks or [], kb_name=kb_name,
                                                  context=extra_context or [])
                cache_hit = False
                timed_out = True
            mem.models["retriever"] = "ddgs+bm25"
            latencies["retriever"] = (time.perf_counter() - t0) * 1000
            shown = await ev.evidence(mem.evidence, text)
            kinds = [it.kind for it in mem.evidence.items]
            web, kb, other = kinds.count("web"), kinds.count("kb"), kinds.count("context")
            clipper = notes.clipper_note(web, kb, other, from_cache=cache_hit, timed_out=timed_out)
            await ev.note("retriever", None, clipper)
            await ev.done("retriever", clipper.rstrip("."),
                          {"sources": len(mem.evidence), "web": web, "kb": kb, "shown": shown})

            # ── 3. Proposer (Groq call 1) ─────────────────────────────────
            stage = "proposer"
            await ev.started("proposer")
            injected("proposer")
            await ev.action("proposer", "llm_call", "Cutting the message into parts")
            t0 = time.perf_counter()
            mem.analysis, res = await self._proposer.run(text, mem.evidence, run_id=run_id)
            mem.record_call("proposer", res)
            mem.models["proposer"] = res.model
            latencies["proposer"] = (time.perf_counter() - t0) * 1000
            parts = mem.analysis.atomic_claims
            await ev.claims(text, parts)
            await ev.note("proposer", None, notes.decomposer_note(len(parts)))
            await ev.done("proposer", notes.decomposer_note(len(parts)).rstrip("."),
                          {"parts": len(parts)}, model=res.model)

            # ── 4+5+6. Analysis bundle (Groq call 2) ∥ NIL local checks ───
            stage = "analysis"
            for agent in ("adversary_a", "adversary_b", "nil_supervisor"):
                await ev.started(agent)
            injected("analysis")
            await ev.action("adversary_a", "llm_call", "Testing each part against sources")
            await ev.action("adversary_b", "llm_call", "Looking for missing perspectives")
            await ev.action("nil_supervisor", "compute", "Reading the wording")
            t0 = time.perf_counter()
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
            claim_texts = {c.id: c.text for c in parts}
            a, b = mem.adversary_a, mem.adversary_b
            await self._emit_challenger(ev, a, claim_texts, bundle.llm.model, "Checked")
            marks_b = await ev.marks("adversary_b", b.flaws, claim_texts)
            auditor = notes.narrative_auditor_note(len(b.missing_perspectives))
            await ev.note("adversary_b", b.public_note, auditor)
            await ev.done("adversary_b", auditor.rstrip("."),
                          {"missing_perspectives": len(b.missing_perspectives), "marks": marks_b},
                          model=bundle.llm.model)
            found = await ev.signals(nil_result, text, b.missing_perspectives)
            await ev.note("nil_supervisor", None, notes.framing_note(found["loaded"], found["absolute"]))
            await ev.done("nil_supervisor", f"Wording reads {nil_result.nil_verdict.replace('_', ' ')}",
                          {"signals": 5}, model=bundle.llm.model)

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
            stage = "judge"
            await ev.started("judge")
            injected("judge")
            await ev.action("judge", "llm_call", "Weighing the findings")
            t0 = time.perf_counter()
            debate_round = 1
            judge, dropped, res = await self._judge.run(
                mem.analysis, mem.adversary_a, mem.adversary_b, nil_result, mem.evidence, run_id=run_id)
            mem.record_call("judge", res)
            mem.add_grounding(dropped)
            while (judge.needs_second_round
                   and judge.verdict_confidence < self.JUDGE_CONFIDENCE_THRESHOLD
                   and debate_round < self.MAX_DEBATE_ROUNDS):
                debate_round += 1
                await ev.debate_round(debate_round, judge.second_round_reason)
                logger.info(f"[{run_id}] Judge asked for round {debate_round}: {judge.second_round_reason}")
                stage = "analysis"
                await ev.started("adversary_a", round=debate_round)
                await ev.action("adversary_a", "llm_call", "Looking again at the sources")
                bundle2 = await self._bundle.run(text, mem.analysis, mem.evidence, debate_round=debate_round,
                                                 judge_question=judge.second_round_reason, run_id=run_id)
                mem.record_call("analysis", bundle2.llm)
                mem.add_grounding(bundle2.grounding)
                mem.adversary_a = bundle2.adversary_a
                await self._emit_challenger(ev, mem.adversary_a, claim_texts, bundle2.llm.model, "Second look at")
                stage = "judge"
                await ev.started("judge", round=debate_round)
                await ev.action("judge", "llm_call", "Weighing the second round")
                judge, dropped, res = await self._judge.run(
                    mem.analysis, mem.adversary_a, mem.adversary_b, nil_result, mem.evidence, run_id=run_id)
                mem.record_call("judge", res)
                mem.add_grounding(dropped)
            # The overall verdict and the part verdicts must tell one story (never a refuted part under a softer headline).
            judge.verdict, judge.claims, reconciled = reconcile_judge(judge.verdict, judge.claims, ev.evidence_ids)
            for why in reconciled:
                logger.info(f"[{run_id}] verdict reconciled: {why}")
            mem.judge = judge
            mem.models["judge"] = res.model
            latencies["judge"] = (time.perf_counter() - t0) * 1000
            labels = [c.get("label", "unverifiable") for c in judge.claims]
            judge_summary = await ev.note("judge", judge.public_note, notes.judge_note(labels))
            await ev.done("judge", notes.judge_note(labels).rstrip("."),
                          {"parts": len(labels), "rounds": debate_round}, model=res.model)
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
        await self._hold_assay(
            ev, run_id, judge.verdict, (CTS, PCS, BIS, NSS, EPS),
            build_signals(
                factual_a=mem.adversary_a.overall_factual_score, judge_cts=judge.metrics.CTS,
                nil_bias=nil_result.BIS, framing=framing_sc, polarity_abs=polarity_abs,
                dominant_frame=dominant_frame, perspective_b=mem.adversary_b.perspective_completeness_score,
                nil_pcs=nil_result.PCS, missing=len(mem.adversary_b.missing_perspectives),
                vader_eps=vader_eps, hedge_ratio=hedge_ratio,
                judge_nss=judge.metrics.NSS if judge.metrics else None))

        # ── 8. Security post-check ────────────────────────────────────────
        t0 = time.perf_counter()
        post = sv.validate_output(judge.consensus_reasoning)
        latencies["security_post"] = (time.perf_counter() - t0) * 1000
        warnings.extend(post.warnings)
        total_latency = (time.perf_counter() - t_start) * 1000

        await ev.verdict_final(
            judge_verdict=judge.verdict, judge_confidence=judge.verdict_confidence, summary=judge_summary,
            claims=judge.claims, challenger={c.claim_id: c.verdict for c in mem.adversary_a.challenges},
            metrics={"CTS": CTS, "PCS": PCS, "BIS": BIS, "NSS": NSS, "EPS": EPS},
        )

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

        logger.info(
            f"[{run_id}] DONE | {verdict} ({confidence:.0%}) | "
            f"CTS={CTS:.2f} PCS={PCS:.2f} BIS={BIS:.2f} NSS={NSS:.2f} EPS={EPS:.2f} | "
            f"{total_latency:.0f}ms | groq_calls={len(mem.llm_calls)} | rounds={debate_round}"
        )
        return output

    @staticmethod
    async def _hold_assay(ev: Any, run_id: str, judge_verdict: str,
                          metrics: tuple, signals: Any) -> None:
        """Run the Assay on the same raw signals as the metrics above and hold `assay.computed`.

        The Assay never changes a number: if its metrics ever differ from the pipeline's, the run
        keeps the pipeline's and the event is dropped (an instrument must not contradict the record).
        A failure here never fails the check; the report then says the readout isn't available."""
        try:
            payload = await asyncio.to_thread(assay_payload, signals, judge_verdict)
            got = tuple(payload["metrics"][k] for k in ("CTS", "PCS", "BIS", "NSS", "EPS"))
            if got != metrics:
                logger.error(f"[{run_id}] assay metrics {got} differ from the pipeline's {metrics}; not emitted")
                return
            ev.hold_assay(payload)
        except Exception as e:  # noqa: BLE001 - an instrument failing must not fail the check
            logger.error(f"[{run_id}] assay.computed not emitted: {type(e).__name__}: {e}")

    @staticmethod
    async def _emit_challenger(ev: Any, report: Any, claim_texts: Dict[str, str], model: str, verb: str) -> None:
        from achp.events import notes
        verdicts = [c.verdict for c in report.challenges]
        held, failed = verdicts.count("supported"), verdicts.count("refuted")
        marks = await ev.marks("adversary_a", report.flaws, claim_texts)
        await ev.note("adversary_a", report.public_note,
                      notes.fact_challenger_note(held, failed, len(verdicts) - held - failed))
        await ev.done("adversary_a", f"{verb} {notes.plural(len(verdicts), 'part')} against the sources",
                      {"parts": len(verdicts), "marks": marks}, model=model)

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


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def NSS_proxy(bis: float, framing: float) -> float:
    """NSS proxy when Judge doesn't return NSS."""
    return round(max(0.0, 1.0 - 0.6*bis - 0.4*framing), 4)

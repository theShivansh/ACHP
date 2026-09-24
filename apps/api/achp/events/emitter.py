"""
RunEvents: the pipeline's view of the event bus.

CorePipeline calls these helpers at each real step; every one ends in `RunEventBus.emit`, which
validates the payload. With no bus (direct library use, the legacy tests) every call is a no-op, so
the pipeline behaves the same with or without a live log.

Everything emitted here is derived from server-side data: the evidence pack's stored text, the
grounded agent outputs, the NIL numbers. Model free text reaches the log only as a validated
`public_note` (achp.events.notes).
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from achp.events import notes
from achp.events.confidence import claim_band, overall_band
from achp.evidence.grounding import find_span

logger = logging.getLogger(__name__)

Span = Tuple[int, int]

# id → (display name, role, parallel group, step). Visual identity stays in the web app.
AGENTS: Dict[str, Tuple[str, str, str, int]] = {
    "security_validator": ("Gatekeeper", "Checks the message is safe to process", "intake", 1),
    "retriever": ("Clipper", "Finds sources on the web and in your library", "sources", 2),
    "proposer": ("Decomposer", "Cuts the message into checkable parts", "parts", 3),
    "adversary_a": ("Fact Challenger", "Tests each part against the sources", "challenge", 4),
    "adversary_b": ("Narrative Auditor", "Looks for missing perspectives", "challenge", 5),
    "nil_supervisor": ("Framing Lens", "Reads the wording for tone, bias and framing", "challenge", 6),
    "judge": ("Judge", "Weighs the findings and labels each part", "verdict", 7),
}

VERDICT_TO_LABEL = {
    "TRUE": "supported", "MOSTLY_TRUE": "supported", "MIXED": "mixed",
    "MOSTLY_FALSE": "contradicted", "FALSE": "contradicted",
    "UNVERIFIABLE": "unverifiable", "BLOCKED": "blocked",
}

ABSOLUTE_TERMS = ("all", "every", "always", "never", "none", "nobody", "everyone", "completely",
                  "totally", "proven", "guaranteed", "100%", "just", "only")

_SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")
_WORD = re.compile(r"[a-z0-9']+", re.I)


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def agent_roster() -> List[Dict[str, Any]]:
    """`run.started.agents[]` from the live configuration (the model registry, env overrides applied)."""
    from achp.llm import registry
    models = registry.logical_models()
    out = []
    for agent_id, (name, role, group, _step) in AGENTS.items():
        m = models.get(agent_id) or {}
        out.append({"id": agent_id, "name": name, "role": role, "group": group,
                    "model": m.get("primary"), "fallback_model": m.get("fallback")})
    return out


# ── Text helpers (pure) ──────────────────────────────────────────────────────

def _tokens(text: str) -> Set[str]:
    return {w.lower() for w in _WORD.findall(text) if len(w) > 2}


def pick_quote(text: str, query: str, max_chars: int = 280) -> Optional[str]:
    """The sentence of `text` that shares the most words with `query`, as a verbatim substring.

    Returns None when nothing usable is found. A sentence longer than `max_chars` is cut at a word
    boundary; the result is still a substring of `text` (no ellipsis is added to the quote itself).
    """
    q = _tokens(query)
    best: Tuple[float, str] = (-1.0, "")
    for m in _SENTENCE.finditer(text or ""):
        sent = m.group(0).strip()
        if len(sent) < 12:
            continue
        score = len(_tokens(sent) & q) + min(len(sent), 200) / 1000
        if score > best[0]:
            best = (score, sent)
    quote = best[1]
    if not quote:
        quote = (text or "").strip()
    if len(quote) > max_chars:
        cut = quote[:max_chars]
        quote = cut[: cut.rfind(" ")] if " " in cut else cut
    quote = quote.strip()
    return quote if quote and quote in (text or "") else None


def source_span(input_text: str, part_text: str) -> Span:
    """Where a part came from in the input: exact/fuzzy match, else the best-overlapping sentence,
    else the whole input."""
    span = find_span(input_text, part_text)
    if span:
        return span
    part = _tokens(part_text)
    best: Tuple[float, Optional[Span]] = (0.0, None)
    for m in _SENTENCE.finditer(input_text):
        sent = m.group(0)
        overlap = len(_tokens(sent) & part) / max(1, len(part))
        if overlap > best[0]:
            lead = len(sent) - len(sent.lstrip())
            best = (overlap, (m.start() + lead, m.start() + len(sent.rstrip())))
    if best[1] and best[0] >= 0.5:
        return best[1]
    return (0, len(input_text))


def word_spans(text: str, words: Iterable[str]) -> List[Span]:
    """Case-insensitive, word-bounded positions of each phrase in `text`, sorted, de-duplicated."""
    spans: Set[Span] = set()
    for w in words:
        w = (w or "").strip()
        if not w:
            continue
        pat = re.compile(r"(?<![\w])" + re.escape(w) + r"(?![\w])", re.I)
        for m in pat.finditer(text):
            spans.add((m.start(), m.end()))
    return sorted(spans)


def evidence_object(item: Any, query: str) -> Optional[Dict[str, Any]]:
    """06 §3.2 EvidenceObject from a pack item, or None when no verbatim quote can be taken."""
    quote = pick_quote(item.text, query)
    if not quote or quote not in item.text:
        return None
    if item.kind == "kb":
        locator = f"library '{item.kb_name or 'KB'}', chunk {item.kb_chunk_index}"
    elif item.kind == "web":
        locator = "search result excerpt"
    else:
        locator = "text you added"
    return {
        "evidence_id": item.evidence_id,
        "source": {"source_id": item.source_id or item.evidence_id, "kind": item.kind, "url": item.url,
                   "domain": item.domain, "title": item.title or None, "published_at": None},
        "locator": locator,
        "quote": quote,
        "verifier_status": "pending",
        "retrieved_at": iso(item.retrieved_at),
    }


# ── The emitter ──────────────────────────────────────────────────────────────

class RunEvents:
    def __init__(self, bus: Any = None, run_id: Optional[str] = None):
        self.bus = bus
        self.run_id = run_id
        self._t0: Dict[str, float] = {}
        self._working: List[str] = []
        self._marks: Set[Tuple[str, str, Span]] = set()
        self.evidence_ids: List[str] = []

    @property
    def enabled(self) -> bool:
        return self.bus is not None and self.run_id is not None

    async def emit(self, type: str, agent: Optional[str], data: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        await self.bus.emit(self.run_id, type, agent, data)

    # ── lanes ────────────────────────────────────────────────────────────

    async def run_started(self, text: str, *, kb_id: Optional[str], kb_name: Optional[str],
                          pipeline_mode: str, prompt_version: Optional[str] = None) -> None:
        data: Dict[str, Any] = {"input": {"type": "text", "text": text}, "agents": agent_roster(),
                                "pipeline_mode": pipeline_mode}
        if kb_id:
            data["kb"] = {"id": kb_id, "name": kb_name or kb_id}
        if prompt_version:
            data["prompt_version"] = prompt_version
        await self.emit("run.started", None, data)

    async def started(self, agent: str, round: Optional[int] = None) -> None:
        self._t0[agent] = time.perf_counter()
        if agent not in self._working:
            self._working.append(agent)
        name, _role, group, step = AGENTS[agent]
        data: Dict[str, Any] = {"step": step, "group": group}
        if round and round > 1:
            data["round"] = round
        await self.emit("agent.started", agent, data)

    async def action(self, agent: str, action: str, label: str, detail: Optional[str] = None,
                     claim_id: Optional[str] = None) -> None:
        data: Dict[str, Any] = {"action": action, "label": notes.clip(label, 40)}
        if detail:
            data["detail"] = notes.clip(detail, 80)
        if claim_id:
            data["claim_id"] = claim_id
        await self.emit("agent.action", agent, data)

    async def note(self, agent: str, note: Optional[str], fallback: str,
                   claim_id: Optional[str] = None) -> str:
        text, source = notes.validate_note(note, fallback, self.evidence_ids)
        if note and source == "template":
            logger.info("[%s] %s public_note replaced by template (%s)", self.run_id, agent,
                        notes.note_problem(note, self.evidence_ids))
        data: Dict[str, Any] = {"note": text, "source": source}
        if claim_id:
            data["claim_id"] = claim_id
        await self.emit("agent.note", agent, data)
        return text

    async def done(self, agent: str, summary: str, counts: Optional[Dict[str, int]] = None,
                   model: Optional[str] = None) -> None:
        t0 = self._t0.get(agent, time.perf_counter())
        if agent in self._working:
            self._working.remove(agent)
        data: Dict[str, Any] = {"duration_ms": int((time.perf_counter() - t0) * 1000),
                                "summary": notes.clip(summary, 100), "counts": counts or {}}
        if model:
            data["model"] = model
        await self.emit("agent.done", agent, data)

    async def skipped(self, agent: str, reason: str) -> None:
        await self.emit("agent.skipped", agent, {"reason": reason})

    async def fail(self, stage: str, code: str, message: str, retryable: bool) -> None:
        """agent.failed for every lane still working, then run.failed."""
        for agent in list(self._working):
            await self.emit("agent.failed", agent,
                            {"error_code": code, "message": notes.clip(message, 200), "retryable": retryable})
            self._working.remove(agent)
        await self.emit("run.failed", None,
                        {"stage": stage, "error_code": code, "message": message, "retryable": retryable})

    # ── outputs ──────────────────────────────────────────────────────────

    async def evidence(self, pack: Any, query: str) -> int:
        """evidence.found per pack item with a verbatim quote; items without one are skipped."""
        kept = 0
        for item in pack.items:
            obj = evidence_object(item, query)
            if obj is None:
                logger.info("[%s] %s skipped: no verbatim quote", self.run_id, item.evidence_id)
                continue
            self.evidence_ids.append(item.evidence_id)
            await self.emit("evidence.found", "retriever", {"evidence": obj})
            kept += 1
        return kept

    async def claims(self, input_text: str, atomic_claims: Sequence[Any]) -> None:
        for c in atomic_claims:
            await self.emit("claim.extracted", "proposer", {"claim": {
                "claim_id": c.id, "text": c.text, "source_span": list(source_span(input_text, c.text)),
                "verifiable": bool(c.verifiable), "epistemic_marker": c.epistemic_marker or "claims",
            }})

    async def marks(self, agent: str, flaws: Sequence[Dict[str, Any]], claim_texts: Dict[str, str]) -> int:
        """claim.marked per grounded flaw; quote → span (exact, case-insensitive, fuzzy ≥0.85),
        else the whole part. Marks already on the log (same part, relation, span) are not repeated."""
        known = set(self.evidence_ids)
        n = 0
        for f in flaws:
            cid = f.get("claim_id")
            part = claim_texts.get(cid or "")
            if part is None:
                continue
            span = find_span(part, f.get("quote") or "") or (0, len(part))
            key = (cid, f.get("relation", "unclear"), span)
            if key in self._marks:
                continue
            self._marks.add(key)
            data: Dict[str, Any] = {"claim_id": cid, "relation": f.get("relation", "unclear"),
                                    "span": list(span),
                                    "evidence_ids": [e for e in f.get("evidence_ids", []) if e in known]}
            if f.get("severity"):
                data["severity"] = int(f["severity"])
            await self.emit("claim.marked", agent, data)
            n += 1
        return n

    async def signals(self, nil: Any, text: str, missing_perspectives: Sequence[Any] = ()) -> Dict[str, List[str]]:
        """signal.computed per NIL sub-check, spans located in the input text. Returns the loaded and
        absolute words found, for the Framing Lens note."""
        s = getattr(nil.sentiment, "data", {}) or {}
        b = getattr(nil.bias, "data", {}) or {}
        p = getattr(nil.perspective, "data", {}) or {}
        f = getattr(nil.framing, "data", {}) or {}

        loaded = list(dict.fromkeys([*s.get("loaded_words", []), *s.get("llm_loaded_language", [])]))
        loaded = [w for w in loaded if word_spans(text, [w])]
        polarity = float(s.get("polarity", 0.0) or 0.0)
        cls = str(s.get("classification", "neutral"))
        await self.emit("signal.computed", "nil_supervisor", {
            "signal": "sentiment", "label": cls.replace("_", " "),
            "value": round(min(1.0, abs(polarity)), 4), "spans": [list(x) for x in word_spans(text, loaded)],
            "explanation": notes.clip(f"Tone reads {cls.replace('_', ' ')}"
                                      + (f"; {notes.plural(len(loaded), 'loaded word')}." if loaded else ".")),
        })

        phrases = [w for w in (b.get("evidence") or []) if word_spans(text, [w])]
        dominant = str(b.get("dominant_bias", "none") or "none")
        await self.emit("signal.computed", "nil_supervisor", {
            "signal": "bias", "label": dominant.replace("_", " "),
            "value": round(max(0.0, min(1.0, float(b.get("BIS", 0.0) or 0.0))), 4),
            "spans": [list(x) for x in word_spans(text, phrases)],
            "explanation": notes.clip("No strong lean in the wording." if dominant == "none" or not phrases
                                      else f"Wording leans {dominant.replace('_', ' ')}: '{phrases[0]}'."),
        })

        pcs = float(p.get("PCS", getattr(nil, "PCS", 0.5)) or 0.0)
        names = [getattr(m, "stakeholder", None) or (m.get("stakeholder") if isinstance(m, dict) else None)
                 for m in (missing_perspectives or p.get("missing_stakeholders", []))]
        names = [n for n in names if n]
        await self.emit("signal.computed", "nil_supervisor", {
            "signal": "perspective",
            "label": "complete" if pcs >= 0.7 else "partial" if pcs >= 0.4 else "narrow",
            "value": round(max(0.0, min(1.0, pcs)), 4), "spans": [],
            "explanation": notes.clip("Missing: " + ", ".join(names) + "." if names
                                      else "No missing stakeholder was listed."),
        })

        frame = str(f.get("dominant_frame", "neutral") or "neutral")
        framed = [w for w in [*(f.get("loaded_phrases") or []), *(f.get("presuppositions") or [])]
                  if isinstance(w, str) and word_spans(text, [w])]
        await self.emit("signal.computed", "nil_supervisor", {
            "signal": "framing", "label": frame.replace("_", " "),
            "value": round(max(0.0, min(1.0, float(getattr(nil, "framing_score", 0.0) or 0.0))), 4),
            "spans": [list(x) for x in word_spans(text, framed)],
            "explanation": notes.clip("Framed neutrally." if frame == "neutral"
                                      else f"Framed as {frame.replace('_', ' ')}."),
        })

        hedges = [w for w in (s.get("hedge_words") or []) if word_spans(text, [w])]
        absolute = [w for w in ABSOLUTE_TERMS if word_spans(text, [w])]
        if s.get("llm_overclaiming"):
            label = "overclaiming"
        elif absolute and not hedges:
            label = "absolute"
        elif hedges:
            label = "hedged"
        else:
            label = "plain"
        await self.emit("signal.computed", "nil_supervisor", {
            "signal": "hedging", "label": label,
            "value": round(max(0.0, min(1.0, float(s.get("hedge_ratio", 0.0) or 0.0))), 4),
            "spans": [list(x) for x in word_spans(text, [*hedges, *absolute])],
            "explanation": notes.clip(
                (f"{notes.plural(len(absolute), 'absolute term')} ('{absolute[0]}')" if absolute else "No absolute terms")
                + (f"; {notes.plural(len(hedges), 'hedge')} ('{hedges[0]}')." if hedges else ".")),
        })
        return {"loaded": loaded, "absolute": absolute}

    async def debate_round(self, round: int, reason: Optional[str]) -> None:
        text, _src = notes.validate_note(reason, "The challengers were asked to look again at conflicting sources.",
                                         self.evidence_ids)
        if "judge" in self._working:
            self._working.remove("judge")
        await self.emit("debate.round", "judge", {"round": round, "reason": text})

    async def verdict_final(self, *, judge_verdict: str, judge_confidence: float, summary: str,
                            claims: Sequence[Dict[str, Any]], challenger: Dict[str, str],
                            metrics: Optional[Dict[str, float]]) -> Dict[str, Any]:
        label = VERDICT_TO_LABEL.get(judge_verdict, "unverifiable")
        parts, rows = [], []
        known = set(self.evidence_ids)
        for c in claims:
            ev_for = [e for e in c.get("evidence_for", []) if e in known]
            ev_against = [e for e in c.get("evidence_against", []) if e in known]
            band, reason = claim_band(c["label"], ev_for, ev_against, challenger.get(c["claim_id"]))
            row: Dict[str, Any] = {"claim_id": c["claim_id"], "label": c["label"], "confidence_band": band,
                                   "confidence_reason": reason, "evidence_for": ev_for,
                                   "evidence_against": ev_against}
            mc = c.get("missing_context")
            if mc:
                problem = notes.note_problem(mc, self.evidence_ids)
                if problem in (None, "too_long", "not_one_sentence"):
                    row["missing_context"] = notes.clip(mc)
            rows.append(row)
            parts.append((c["label"], band, reason))
        band, reason = overall_band(label, parts, judge_confidence)
        data: Dict[str, Any] = {
            "overall": {"label": label, "summary": notes.clip(summary), "confidence_band": band,
                        "confidence_reason": reason, "judge_verdict": judge_verdict},
            "claims": rows,
        }
        if metrics:
            data["metrics"] = {k: round(float(metrics[k]), 4) for k in ("CTS", "PCS", "BIS", "NSS", "EPS")}
        await self.emit("verdict.final", "judge" if label != "blocked" else None, data)
        return data

"""
Grounding: make model output honest before anything downstream uses it.

Pure functions. Each takes a validated model output plus the run's evidence pack and returns a
cleaned copy together with a count of what it removed, so the run log can say how much was
dropped. Rules:

- Evidence ids must exist in the pack. Unknown ids are removed.
- A finding that asserts support or contradiction must cite at least one valid id; otherwise it
  is downgraded (challenge → "unverifiable", claim label → "unverifiable") or dropped (flaw,
  critical flaw).
- Quotes and phrases must be verbatim in the text they claim to come from (exact, then case- and
  whitespace-insensitive). Anything else is removed.
- URLs in free text must be URLs of pack items; others are removed.
- With no grounded finding at all, the factual score is neutral (0.5) and the verdict is
  UNVERIFIABLE. Nothing is ever invented to fill a gap.
"""
from __future__ import annotations

import re
from collections import Counter
from difflib import SequenceMatcher
from typing import Dict, Iterable, List, Optional, Tuple

from achp.evidence.pack import EvidencePack
from achp.prompts.schemas import (
    AnalysisBundleOutput,
    JudgeOutput,
    LanguageSignalsOut,
)

Span = Tuple[int, int]
_URL = re.compile(r"https?://[^\s)\]>\"']+", re.I)
_WS = re.compile(r"\s+")


# ─────────────────────────────────────────────────────────────────────────────
# Text matching
# ─────────────────────────────────────────────────────────────────────────────

def _norm(text: str) -> str:
    return _WS.sub(" ", text).strip().casefold()


def is_verbatim(haystack: str, quote: str) -> bool:
    """True if `quote` appears in `haystack` exactly, or ignoring case and runs of whitespace."""
    if not quote or not quote.strip():
        return False
    if quote in haystack:
        return True
    return _norm(quote) in _norm(haystack)


def find_span(haystack: str, quote: str, fuzzy_threshold: float = 0.85) -> Optional[Span]:
    """Character span of `quote` in `haystack`: exact, then case-insensitive, then fuzzy (≥0.85).

    Used to place marks on claim text (06 §6). Returns None if nothing clears the threshold; the
    caller decides the fallback (06 says: the whole strip).
    """
    if not quote or not haystack:
        return None
    i = haystack.find(quote)
    if i >= 0:
        return (i, i + len(quote))
    i = haystack.casefold().find(quote.casefold())
    if i >= 0:
        return (i, i + len(quote))
    # Fuzzy: compare against windows that start and end on word boundaries.
    q = quote.strip()
    starts = [0] + [m.end() for m in re.finditer(r"\s+", haystack)]
    ends = [m.start() for m in re.finditer(r"\s+", haystack)] + [len(haystack)]
    best: Tuple[float, Optional[Span]] = (0.0, None)
    target = len(q)
    for s in starts:
        for e in ends:
            if e <= s or abs((e - s) - target) > max(8, target // 3):
                continue
            ratio = SequenceMatcher(None, haystack[s:e].casefold(), q.casefold()).ratio()
            if ratio > best[0]:
                best = (ratio, (s, e))
    if best[0] < fuzzy_threshold or best[1] is None:
        return None
    s, e = best[1]
    edge = ".,;:!?\"'()[]“”‘’"
    while e > s and haystack[e - 1] in edge and haystack[e - 1] not in q[-1:]:
        e -= 1
    while s < e and haystack[s] in edge and haystack[s] not in q[:1]:
        s += 1
    return (s, e)


def strip_foreign_urls(text: str, pack: EvidencePack) -> str:
    allowed = pack.urls()
    return _URL.sub(lambda m: m.group(0) if m.group(0).rstrip(".,;") in allowed else "", text).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Analysis bundle
# ─────────────────────────────────────────────────────────────────────────────

def ground_bundle(
    bundle: AnalysisBundleOutput,
    pack: EvidencePack,
    claim_text: str,
    claim_texts: Dict[str, str],
) -> Tuple[AnalysisBundleOutput, Counter]:
    """Clean the challenge panel's output. `claim_texts` maps claim_id → that part's text."""
    b = bundle.model_copy(deep=True)
    dropped: Counter = Counter()

    # Fact challenge ---------------------------------------------------------
    fc = b.fact_challenge
    known = [c for c in fc.challenges if c.claim_id in claim_texts]
    dropped["challenge_unknown_claim"] += len(fc.challenges) - len(known)
    fc.challenges = known
    grounded_findings = 0
    for ch in fc.challenges:
        before = len(ch.supporting_evidence_ids) + len(ch.counter_evidence_ids)
        ch.supporting_evidence_ids = pack.valid(ch.supporting_evidence_ids)
        ch.counter_evidence_ids = pack.valid(ch.counter_evidence_ids)
        dropped["unknown_evidence_id"] += before - len(ch.supporting_evidence_ids) - len(ch.counter_evidence_ids)
        if ch.verdict == "supported" and not ch.supporting_evidence_ids:
            ch.verdict, ch.confidence = "unverifiable", min(ch.confidence, 0.5)
            dropped["ungrounded_verdict"] += 1
        elif ch.verdict == "refuted" and not ch.counter_evidence_ids:
            ch.verdict, ch.confidence = "unverifiable", min(ch.confidence, 0.5)
            dropped["ungrounded_verdict"] += 1
        elif ch.verdict == "contested" and not (ch.supporting_evidence_ids or ch.counter_evidence_ids):
            ch.verdict, ch.confidence = "unverifiable", min(ch.confidence, 0.5)
            dropped["ungrounded_verdict"] += 1
        if ch.verdict != "unverifiable":
            grounded_findings += 1
    if not grounded_findings:
        if fc.overall_factual_score != 0.5:
            dropped["factual_score_neutralised"] += 1
        fc.overall_factual_score = 0.5

    kept_cf = []
    for cf in fc.critical_flaws:
        cf.evidence_ids = pack.valid(cf.evidence_ids)
        cf.text = strip_foreign_urls(cf.text, pack)
        if cf.kind in ("contradicted_by_evidence", "outdated") and not cf.evidence_ids:
            dropped["ungrounded_critical_flaw"] += 1
            continue
        if cf.text:
            kept_cf.append(cf)
    fc.critical_flaws = kept_cf
    fc.flaws = _ground_flaws(fc.flaws, pack, claim_texts, dropped)
    fc.public_note = strip_foreign_urls(fc.public_note, pack)

    # Narrative audit --------------------------------------------------------
    na = b.narrative_audit
    for mp in na.missing_perspectives:
        mp.evidence_ids = pack.valid(mp.evidence_ids)
    na.flaws = _ground_flaws(na.flaws, pack, claim_texts, dropped)
    na.public_note = strip_foreign_urls(na.public_note, pack)

    # Language signals: phrases must come from the claim --------------------
    b.language_signals = _ground_signals(b.language_signals, claim_text, dropped)
    return b, dropped


def _ground_flaws(flaws, pack: EvidencePack, claim_texts: Dict[str, str], dropped: Counter):
    kept = []
    for f in flaws:
        if f.claim_id not in claim_texts:
            dropped["flaw_unknown_claim"] += 1
            continue
        f.evidence_ids = pack.valid(f.evidence_ids)
        if f.relation in ("contradicts", "supports") and not f.evidence_ids:
            dropped["ungrounded_flaw"] += 1
            continue
        if not find_span(claim_texts[f.claim_id], f.quote):
            # Keep the finding, mark the whole part (06 §6), but never keep a made-up quote.
            f.quote = claim_texts[f.claim_id]
            dropped["flaw_quote_replaced"] += 1
        kept.append(f)
    return kept


def _ground_signals(sig: LanguageSignalsOut, claim_text: str, dropped: Counter) -> LanguageSignalsOut:
    for attr in ("bias_phrases", "loaded_language"):
        items: List[str] = getattr(sig, attr)
        kept = [p for p in items if is_verbatim(claim_text, p)]
        dropped[f"{attr}_not_verbatim"] += len(items) - len(kept)
        setattr(sig, attr, kept)
    return sig


# ─────────────────────────────────────────────────────────────────────────────
# Judge
# ─────────────────────────────────────────────────────────────────────────────

_GROUNDED_LABELS = {"supported", "contradicted", "mixed", "missing_context"}


def ground_judge(judge: JudgeOutput, pack: EvidencePack, claim_ids: Iterable[str]) -> Tuple[JudgeOutput, Counter]:
    """Enforce evidence-first labels and the UNVERIFIABLE rule on the Judge's output."""
    j = judge.model_copy(deep=True)
    dropped: Counter = Counter()
    known_claims = set(claim_ids)

    claims = []
    for c in j.claims:
        if c.claim_id not in known_claims:
            dropped["judge_unknown_claim"] += 1
            continue
        c.evidence_for = pack.valid(c.evidence_for)
        c.evidence_against = pack.valid(c.evidence_against)
        ok = {
            "supported": bool(c.evidence_for),
            "contradicted": bool(c.evidence_against),
            "mixed": bool(c.evidence_for or c.evidence_against),
            "missing_context": bool(c.evidence_for or c.evidence_against),
            "unverifiable": True,
        }[c.label]
        if not ok:
            dropped["ungrounded_claim_label"] += 1
            c.label = "unverifiable"
        claims.append(c)
    j.claims = claims

    j.key_supporting_evidence_ids = pack.valid(j.key_supporting_evidence_ids)
    j.key_contradicting_evidence_ids = pack.valid(j.key_contradicting_evidence_ids)
    j.consensus_reasoning = _strip_unknown_refs(strip_foreign_urls(j.consensus_reasoning, pack), pack, dropped)
    j.debate_summary = _strip_unknown_refs(strip_foreign_urls(j.debate_summary, pack), pack, dropped)
    j.important_caveats = [strip_foreign_urls(c, pack) for c in j.important_caveats if c.strip()]
    j.public_note = strip_foreign_urls(j.public_note, pack)

    grounded = any(c.label in _GROUNDED_LABELS for c in j.claims)
    if (not len(pack) or not grounded) and j.verdict != "UNVERIFIABLE":
        dropped["verdict_forced_unverifiable"] += 1
        j.verdict = "UNVERIFIABLE"
        j.verdict_confidence = min(j.verdict_confidence, 0.5)
        note = ("No retrieved source settled any part of this claim, so it can't be rated."
                if len(pack) else "No sources were found for this claim, so it can't be rated.")
        if note not in j.important_caveats:
            j.important_caveats = [note] + j.important_caveats[:3]
    if j.verdict == "UNVERIFIABLE":
        j.needs_second_round = False
    return j, dropped


_REF = re.compile(r"\[(e\d+)\]", re.I)


def _strip_unknown_refs(text: str, pack: EvidencePack, dropped: Counter) -> str:
    known = set(pack.ids())

    def repl(m: re.Match) -> str:
        if m.group(1).lower() in known:
            return m.group(0)
        dropped["unknown_ref_in_text"] += 1
        return ""
    return _REF.sub(repl, text).strip()

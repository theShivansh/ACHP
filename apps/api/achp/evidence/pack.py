"""
The evidence pack: every fact an LLM may use in a run, each with a server-assigned id.

Retrieval (web search, the user's library) happens on the server before any model call. The pack
is the only evidence the Proposer, the analysis bundle and the Judge ever see, and grounding
(achp.evidence.grounding) rejects any reference that isn't in it.
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Literal, Optional
from urllib.parse import urlparse

EvidenceKind = Literal["web", "kb", "context"]

PROMPT_TEXT_CHARS = 700   # per item, in prompts
MAX_ITEMS = 8


@dataclass
class EvidenceItem:
    evidence_id: str
    kind: EvidenceKind
    text: str                                   # the fetched text (verbatim) the item stands on
    source_id: str = ""
    url: Optional[str] = None
    domain: Optional[str] = None
    title: str = ""
    retrieval_method: str = ""
    score: float = 0.0
    retrieved_at: float = field(default_factory=time.time)
    kb_chunk_index: Optional[int] = None
    kb_name: Optional[str] = None

    def label(self) -> str:
        if self.kind == "kb":
            return f"library '{self.kb_name or 'KB'}' · chunk {self.kb_chunk_index}"
        if self.domain:
            return self.domain
        return "provided context"

    def prompt_view(self) -> Dict[str, Any]:
        return {
            "id": self.evidence_id,
            "kind": self.kind,
            "source": self.label(),
            "title": self.title[:160],
            "text": self.text[:PROMPT_TEXT_CHARS],
        }

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class EvidencePack:
    query: str
    items: List[EvidenceItem] = field(default_factory=list)
    from_cache: bool = False
    built_at: float = field(default_factory=time.time)

    # ── construction ─────────────────────────────────────────────────────

    @classmethod
    def build(
        cls,
        query: str,
        *,
        kb_chunks: Iterable[Dict[str, Any]] = (),
        kb_name: Optional[str] = None,
        web_docs: Iterable[Any] = (),
        context: Iterable[str] = (),
        from_cache: bool = False,
        max_items: int = MAX_ITEMS,
    ) -> "EvidencePack":
        """Library chunks first (the user chose them), then web results, then loose context."""
        pack = cls(query=query, from_cache=from_cache)
        seen: set[str] = set()

        def add(**kw: Any) -> None:
            text = (kw.get("text") or "").strip()
            key = text[:200].lower()
            if not text or key in seen or len(pack.items) >= max_items:
                return
            seen.add(key)
            pack.items.append(EvidenceItem(evidence_id=f"e{len(pack.items) + 1}", **kw))

        for ch in kb_chunks:
            add(kind="kb", text=ch.get("text", ""), source_id=f"kb:{ch.get('chunk_index')}",
                retrieval_method="kb", score=float(ch.get("score", 0.0) or 0.0),
                kb_chunk_index=ch.get("chunk_index"), kb_name=kb_name)
        for d in web_docs:
            get = (lambda k, default=None: d.get(k, default)) if isinstance(d, dict) else \
                  (lambda k, default=None: getattr(d, k, default))
            url = get("source") or None
            url = url if url and str(url).startswith(("http://", "https://")) else None
            meta = get("metadata", {}) or {}
            add(kind="web", text=get("content", ""), source_id=url or "web",
                url=url, domain=urlparse(url).netloc.lower().removeprefix("www.") if url else None,
                title=str(meta.get("title", "") or ""),
                retrieval_method=str(get("retrieval_method", "web") or "web"),
                score=float(get("score", 0.0) or 0.0),
                retrieved_at=float(meta.get("retrieved_at", time.time())))
        for i, text in enumerate(context):
            add(kind="context", text=text, source_id=f"ctx:{i}", retrieval_method="context")
        return pack

    # ── lookup ───────────────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self.items)

    def get(self, evidence_id: str) -> Optional[EvidenceItem]:
        for it in self.items:
            if it.evidence_id == evidence_id:
                return it
        return None

    def ids(self) -> List[str]:
        return [it.evidence_id for it in self.items]

    def valid(self, ids: Iterable[str]) -> List[str]:
        """The ids that exist in this pack, de-duplicated, in the order given."""
        known = set(self.ids())
        out: List[str] = []
        for raw in ids or []:
            eid = str(raw).strip().strip("[]").lower()
            if eid in known and eid not in out:
                out.append(eid)
        return out

    def urls(self) -> set[str]:
        return {it.url for it in self.items if it.url}

    def oldest_retrieved_at(self) -> Optional[float]:
        return min((it.retrieved_at for it in self.items), default=None)

    def prompt_view(self) -> List[Dict[str, Any]]:
        return [it.prompt_view() for it in self.items]

    def cite(self, evidence_id: str, max_chars: int = 220) -> str:
        """A human-readable line for an evidence id, built from the stored text (never model text)."""
        it = self.get(evidence_id)
        if not it:
            return ""
        text = " ".join(it.text.split())
        snippet = text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"
        return f"“{snippet}” ({it.label()}) [{it.evidence_id}]"

    def to_dicts(self) -> List[Dict[str, Any]]:
        return [it.to_dict() for it in self.items]

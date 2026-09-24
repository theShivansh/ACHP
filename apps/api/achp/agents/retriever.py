"""
ACHP — Retriever Agent (Onyx-style Agentic RAG)
================================================
Tools run here, on the server, before any model is called. The result is an EvidencePack:
library chunks (the user's KB) first, then web results, each with a server-assigned evidence id.

Pipeline per query:
  1. Evidence cache (exact normalized query, short TTL; web results only)
  2. BM25 lexical search over a local corpus (if one is loaded)
  3. Semantic (bi-encoder) re-rank of the BM25 results
  4. Web search (DDGS) when there's no local corpus
  5. Cache write-back (non-empty web results only) → EvidencePack

Library chunks are never cached here: they're read fresh from the KB store for every run.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from achp.cache.embeddings import encode, batch_cosine_similarity
from achp.evidence.pack import EvidencePack
from achp.memory.evidence_cache import EvidenceCache, get_evidence_cache

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RetrievedDoc:
    content: str
    source: str
    score: float
    retrieval_method: str  # "bm25", "semantic", "web", "cache"
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievalResult:
    query: str
    docs: List[RetrievedDoc]
    from_cache: bool
    latency_ms: float
    cache_tier: int = -1    # -1 = miss, 0 = exact evidence-cache hit
    pack: Optional[EvidencePack] = None


# ─────────────────────────────────────────────────────────────────────────────
# BM25 Local Corpus
# ─────────────────────────────────────────────────────────────────────────────

class BM25Retriever:
    """
    Lightweight BM25 retriever over an in-memory corpus.
    Falls back gracefully if rank-bm25 is unavailable.
    """
    def __init__(self):
        self._corpus: List[str] = []
        self._sources: List[str] = []
        self._bm25 = None
        self._available = self._check_bm25()

    def _check_bm25(self) -> bool:
        try:
            from rank_bm25 import BM25Okapi  # noqa: F401
            return True
        except ImportError:
            logger.warning("rank-bm25 not installed. BM25 disabled.")
            return False

    def index(self, documents: List[str], sources: Optional[List[str]] = None) -> None:
        if not self._available:
            return
        from rank_bm25 import BM25Okapi
        self._corpus = documents
        self._sources = sources or [f"doc_{i}" for i in range(len(documents))]
        tokenized = [doc.lower().split() for doc in documents]
        self._bm25 = BM25Okapi(tokenized)
        logger.info(f"BM25 index built: {len(documents)} documents")

    def search(self, query: str, top_k: int = 10) -> List[RetrievedDoc]:
        if not self._available or self._bm25 is None:
            return []
        scores = self._bm25.get_scores(query.lower().split())
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
        return [
            RetrievedDoc(
                content=self._corpus[i],
                source=self._sources[i],
                score=float(scores[i]),
                retrieval_method="bm25",
            )
            for i in top_indices if scores[i] > 0
        ]


# ─────────────────────────────────────────────────────────────────────────────
# Web Fallback (DDGS)
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_web_result(r: dict) -> Optional[RetrievedDoc]:
    """Normalize a raw ddgs result dict into a RetrievedDoc.

    Handles field-name variations across ddgs versions:
    - content: body / snippet / text
    - source:  href / url / link
    Returns None if no usable content is found.
    """
    content = (
        r.get("body")
        or r.get("snippet")
        or r.get("text")
        or ""
    ).strip()

    source = (
        r.get("href")
        or r.get("url")
        or r.get("link")
        or "web"
    )

    if not content:
        return None

    return RetrievedDoc(
        content=content,
        source=source,
        score=1.0,
        retrieval_method="web",
        metadata={"title": r.get("title", ""), "retrieved_at": time.time()},
    )


def _ddgs_text_sync(query: str, max_results: int) -> List[dict]:
    """Blocking DDGS call — intended to run via asyncio.to_thread()."""
    from ddgs import DDGS  # noqa: PLC0415
    with DDGS() as client:
        return list(client.text(query, max_results=max_results))


async def _web_search(query: str, max_results: int = 5) -> List[RetrievedDoc]:
    """Async web search via DDGS, offloaded to a thread pool."""
    try:
        raw_results = await asyncio.to_thread(_ddgs_text_sync, query, max_results)
        logger.debug(f"DDGS returned {len(raw_results)} raw results for '{query[:60]}'")
        results: List[RetrievedDoc] = []
        for r in raw_results:
            doc = _normalize_web_result(r)
            if doc:
                results.append(doc)
        logger.info(f"_web_search | {len(results)} usable docs (from {len(raw_results)} raw) | '{query[:60]}'")
        return results
    except Exception as e:
        logger.warning(f"Web search failed: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Retriever Agent
# ─────────────────────────────────────────────────────────────────────────────

class RetrieverAgent:
    """
    Onyx-style Agentic RAG Retriever.

    1. Evidence cache (exact query, TTL)
    2. BM25 lexical search
    3. Semantic re-ranking (bi-encoder cosine)
    4. Web fallback (DDGS)
    5. Cache write-back → EvidencePack
    """

    AGENT_ID = "retriever"

    def __init__(
        self,
        cache: Optional[EvidenceCache] = None,
        top_k: int = 5,
        use_web_fallback: bool = True,
        bi_encoder: str = "sentence-transformers/all-MiniLM-L6-v2",
    ):
        self.cache = cache or get_evidence_cache()
        self.bm25 = BM25Retriever()
        self.top_k = top_k
        self.use_web_fallback = use_web_fallback
        self.bi_encoder = bi_encoder
        logger.info(f"RetrieverAgent initialized | top_k={top_k}")

    def load_corpus(self, documents: List[str], sources: Optional[List[str]] = None) -> None:
        """Pre-index a local document corpus for BM25 search."""
        self.bm25.index(documents, sources)

    async def retrieve(
        self,
        query: str,
        *,
        kb_chunks: Optional[List[Dict[str, Any]]] = None,
        kb_name: Optional[str] = None,
        extra_context: Optional[List[str]] = None,
    ) -> RetrievalResult:
        """Main retrieval entry point. `query` is the claim itself, never claim + library text."""
        t0 = time.perf_counter()
        from_cache = False

        cached = self.cache.get(query)
        if cached is not None:
            docs: List[Any] = cached
            from_cache = True
        else:
            bm25_docs = self.bm25.search(query, top_k=self.top_k * 2)
            if bm25_docs:
                found = await self._semantic_rerank(query, bm25_docs)
            elif self.use_web_fallback:
                found = await _web_search(query, max_results=self.top_k)
            else:
                found = []
            found = found[: self.top_k]
            docs = [
                {
                    "content": d.content,
                    "source": d.source,
                    "score": d.score,
                    "retrieval_method": d.retrieval_method,
                    "metadata": d.metadata,
                }
                for d in found
            ]
            self.cache.set(query, docs)

        pack = EvidencePack.build(
            query,
            kb_chunks=kb_chunks or [],
            kb_name=kb_name,
            web_docs=docs,
            context=extra_context or [],
            from_cache=from_cache,
        )
        latency = (time.perf_counter() - t0) * 1000
        logger.info(
            f"RetrieverAgent | {len(pack)} evidence items ({len(docs)} web, cache={from_cache}) "
            f"| {latency:.0f}ms | '{query[:50]}'"
        )
        return RetrievalResult(
            query=query,
            docs=[RetrievedDoc(content=d["content"], source=d["source"], score=d["score"],
                               retrieval_method="cache" if from_cache else d["retrieval_method"],
                               metadata=d.get("metadata", {})) for d in docs],
            from_cache=from_cache,
            latency_ms=latency,
            cache_tier=0 if from_cache else -1,
            pack=pack,
        )

    async def _semantic_rerank(
        self, query: str, docs: List[RetrievedDoc]
    ) -> List[RetrievedDoc]:
        """Re-rank BM25 results by bi-encoder cosine similarity.

        Encodes all documents in a single batch call (much faster than
        individual encode() calls) and uses batch_cosine_similarity() for
        vectorised scoring instead of a per-doc loop.
        """
        # ── Encode query (single vector) ──────────────────────────────────
        query_vec = await asyncio.to_thread(encode, query, self.bi_encoder)

        # ── Batch-encode all documents in one model call ──────────────────
        texts = [doc.content[:512] for doc in docs]
        doc_vecs = await asyncio.to_thread(encode, texts, self.bi_encoder)

        # ── Vectorised cosine similarity (query · doc_vecs.T) ─────────────
        scores = batch_cosine_similarity(query_vec, doc_vecs)  # shape: (n,)

        for doc, score in zip(docs, scores):
            doc.score = float(score)
            doc.retrieval_method = "semantic"

        return sorted(docs, key=lambda d: d.score, reverse=True)

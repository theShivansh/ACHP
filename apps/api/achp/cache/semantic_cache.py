"""
ACHP — Semantic Cache (DeepLearning.AI Pattern)
================================================
Three-tier hit detection:
  Tier 0 — Exact SHA-256 hash match (deterministic, ~0ms)
  Tier 1 — Bi-encoder cosine similarity (fast, ~5ms)
  Tier 2 — Cross-encoder reranking (precise, ~50ms, only on near-misses)
  Tier 3 — LLM semantic validation (gold standard, only on ambiguous hits)

Backend: Redis (production) or in-memory dict (dev/test via USE_FAKEREDIS=true).

Metrics tracked per session:
  - hit_rate, precision, recall, avg_latency_ms
  - tier_breakdown (how many hits at each tier)
  - threshold_decisions (for calibration)

Usage:
    cache = SemanticCache()
    cached = await cache.get("What is climate change?")
    if cached:
        return cached
    result = await run_pipeline(query)
    await cache.set("What is climate change?", result)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from achp.cache.embeddings import (
    batch_cosine_similarity,
    content_hash,
    cosine_similarity,
    cross_encode_score,
    encode,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CacheEntry:
    """A single item stored in the semantic cache."""
    key: str                        # short SHA hash
    query: str                      # original query text
    embedding: List[float]          # bi-encoder vector
    response: Dict[str, Any]        # full ACHP pipeline output
    timestamp: float = field(default_factory=time.time)
    ttl: int = 3600                 # seconds
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)

    def is_expired(self) -> bool:
        return (time.time() - self.timestamp) > self.ttl


@dataclass
class CacheHit:
    """Result of a cache lookup."""
    hit: bool
    tier: int                       # 0=exact, 1=cosine, 2=cross-enc, 3=llm, -1=miss
    similarity: float               # final similarity score
    entry: Optional[CacheEntry]
    latency_ms: float
    validation_note: str = ""


@dataclass
class CacheMetrics:
    """Running metrics for a session."""
    total_queries: int = 0
    hits: int = 0
    misses: int = 0
    true_positives: int = 0         # correct hits
    false_positives: int = 0        # wrong hits served
    false_negatives: int = 0        # misses that should have been hits
    tier_counts: Dict[int, int] = field(default_factory=lambda: {0: 0, 1: 0, 2: 0, 3: 0})
    latencies_ms: List[float] = field(default_factory=list)
    threshold_decisions: List[Dict] = field(default_factory=list)

    @property
    def hit_rate(self) -> float:
        if self.total_queries == 0:
            return 0.0
        return self.hits / self.total_queries

    @property
    def precision(self) -> float:
        total_served = self.true_positives + self.false_positives
        return self.true_positives / total_served if total_served > 0 else 0.0

    @property
    def recall(self) -> float:
        total_relevant = self.true_positives + self.false_negatives
        return self.true_positives / total_relevant if total_relevant > 0 else 0.0

    @property
    def avg_latency_ms(self) -> float:
        return sum(self.latencies_ms) / len(self.latencies_ms) if self.latencies_ms else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) > 0 else 0.0

    def to_dict(self) -> Dict:
        return {
            "total_queries": self.total_queries,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": round(self.hit_rate, 4),
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "avg_latency_ms": round(self.avg_latency_ms, 2),
            "tier_breakdown": self.tier_counts,
            "false_positives": self.false_positives,
            "false_negatives": self.false_negatives,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Cache Config
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CacheConfig:
    # Thresholds (tunable)
    exact_match: bool = True
    cosine_threshold: float = 0.80          # Tier 1 gate (tuned for all-MiniLM-L6-v2)
    cross_encoder_threshold: float = 0.55   # Tier 2 gate (raw logit normalized)
    fuzzy_threshold: float = 0.30           # Min fuzzy ratio — only blocks totally unrelated strings
    llm_validation_enabled: bool = True
    llm_validation_threshold: float = 0.80  # Confidence for LLM to confirm hit

    # Tier activation
    use_tier_0: bool = True   # Exact hash
    use_tier_1: bool = True   # Cosine
    use_tier_2: bool = True   # Cross-encoder (on near-misses: 0.80–cosine_threshold)
    use_tier_3: bool = True   # LLM validation (on ambiguous cross-enc)

    # Storage
    use_fakeredis: bool = True
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    ttl_seconds: int = 3600
    max_entries: int = 10_000

    # Models
    bi_encoder: str = "sentence-transformers/all-MiniLM-L6-v2"
    cross_encoder: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    llm_validator_model: str = "meta-llama/llama-4-scout"
    llm_validator_provider: str = "groq"

    # Near-miss band: activate cross-encoder only in [cosine_near_miss_low, cosine_threshold)
    cosine_near_miss_low: float = 0.70

    @classmethod
    def from_env(cls) -> "CacheConfig":
        return cls(
            use_fakeredis=os.getenv("USE_FAKEREDIS", "true").lower() == "true",
            redis_host=os.getenv("REDIS_HOST", "localhost"),
            redis_port=int(os.getenv("REDIS_PORT", 6379)),
            cosine_threshold=float(os.getenv("CACHE_COSINE_THRESHOLD", 0.85)),
            llm_validation_enabled=os.getenv("CACHE_LLM_VALIDATION", "true").lower() == "true",
        )


# ─────────────────────────────────────────────────────────────────────────────
# In-Memory Backend (fakeredis fallback)
# ─────────────────────────────────────────────────────────────────────────────

class InMemoryBackend:
    """
    Thread/async-safe in-memory backend.
    Stores entries and a flat embedding matrix for vectorized search.
    """
    def __init__(self, max_entries: int = 10_000):
        self._store: Dict[str, CacheEntry] = {}    # key → entry
        self._max = max_entries
        self._query_to_key: Dict[str, str] = {}    # normalized_query → key (exact dedup)

    def get_entry(self, key: str) -> Optional[CacheEntry]:
        entry = self._store.get(key)
        if entry and not entry.is_expired():
            entry.access_count += 1
            entry.last_accessed = time.time()
            return entry
        if entry:
            del self._store[key]  # evict expired
        return None

    def set_entry(self, entry: CacheEntry) -> None:
        if len(self._store) >= self._max:
            self._evict_lru()
        self._store[entry.key] = entry
        self._query_to_key[entry.query.strip().lower()] = entry.key

    def get_all_entries(self) -> List[CacheEntry]:
        valid = []
        expired_keys = []
        for k, e in self._store.items():
            if e.is_expired():
                expired_keys.append(k)
            else:
                valid.append(e)
        for k in expired_keys:
            del self._store[k]
        return valid

    def _evict_lru(self) -> None:
        """Evict least recently used entry."""
        if not self._store:
            return
        lru_key = min(self._store, key=lambda k: self._store[k].last_accessed)
        del self._store[lru_key]

    def size(self) -> int:
        return len(self._store)


# ─────────────────────────────────────────────────────────────────────────────
# Redis Backend
# ─────────────────────────────────────────────────────────────────────────────

class RedisBackend:
    """
    Redis-backed storage. Entries serialized as JSON.
    Embeddings stored as float32 bytes for fast retrieval.
    """
    def __init__(self, host: str, port: int, db: int, ttl: int):
        try:
            import redis
            self._client = redis.Redis(host=host, port=port, db=db, decode_responses=False)
            self._client.ping()
            self._ttl = ttl
            logger.info(f"Connected to Redis at {host}:{port}")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Falling back to in-memory.")
            raise

    def _entry_key(self, key: str) -> str:
        return f"achp:cache:{key}"

    def _index_key(self) -> str:
        return "achp:cache:index"

    def get_entry(self, key: str) -> Optional[CacheEntry]:
        raw = self._client.get(self._entry_key(key))
        if not raw:
            return None
        data = json.loads(raw)
        entry = CacheEntry(
            key=data["key"],
            query=data["query"],
            embedding=data["embedding"],
            response=data["response"],
            timestamp=data["timestamp"],
            ttl=data["ttl"],
            access_count=data["access_count"],
            last_accessed=data["last_accessed"],
        )
        return entry if not entry.is_expired() else None

    def set_entry(self, entry: CacheEntry) -> None:
        data = {
            "key": entry.key,
            "query": entry.query,
            "embedding": entry.embedding,
            "response": entry.response,
            "timestamp": entry.timestamp,
            "ttl": entry.ttl,
            "access_count": entry.access_count,
            "last_accessed": entry.last_accessed,
        }
        self._client.setex(self._entry_key(entry.key), entry.ttl, json.dumps(data))
        self._client.sadd(self._index_key(), entry.key)

    def get_all_entries(self) -> List[CacheEntry]:
        keys = self._client.smembers(self._index_key())
        entries = []
        for k in keys:
            e = self.get_entry(k.decode())
            if e:
                entries.append(e)
        return entries

    def size(self) -> int:
        return self._client.scard(self._index_key())


# ─────────────────────────────────────────────────────────────────────────────
# LLM Validator (Groq / OpenRouter)
# ─────────────────────────────────────────────────────────────────────────────

async def _llm_validate_hit(
    query: str,
    cached_query: str,
    model: str = "meta-llama/llama-4-scout",
    provider: str = "groq",
) -> Tuple[bool, float, str]:
    """
    Ask an LLM to determine if a cached query's response would satisfy the new query.
    Returns: (is_valid_hit, confidence_0_to_1, reasoning)
    """
    prompt = f"""You are evaluating semantic cache validity for an AI fact-checking system.

CACHED QUERY: "{cached_query}"
NEW QUERY: "{query}"

Task: Would the answer to the cached query fully and accurately answer the new query?
Answer format (JSON only):
{{"valid": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}}

Be strict: answer "valid: false" if the queries differ in scope, entity, or intent even slightly."""

    try:
        if provider == "groq":
            from groq import AsyncGroq
            client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=150,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=os.getenv("OPENROUTER_API_KEY"),
                base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            )
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=150,
            )
            result = json.loads(response.choices[0].message.content)

        return result.get("valid", False), float(result.get("confidence", 0.0)), result.get("reason", "")

    except Exception as e:
        logger.warning(f"LLM validation failed: {e}. Defaulting to no-hit.")
        return False, 0.0, f"LLM error: {e}"


# ─────────────────────────────────────────────────────────────────────────────
# Fuzzy String Matching Utility
# ─────────────────────────────────────────────────────────────────────────────

def _fuzzy_ratio(a: str, b: str) -> float:
    """SequenceMatcher-based fuzzy string ratio (0–1)."""
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


# ─────────────────────────────────────────────────────────────────────────────
# SemanticCache — Main Class
# ─────────────────────────────────────────────────────────────────────────────

class SemanticCache:
    """
    Three-tier semantic cache for ACHP pipeline outputs.

    Tier 0 – Exact SHA-256 hash match
    Tier 1 – Bi-encoder cosine similarity ≥ threshold  (fast)
    Tier 2 – Cross-encoder reranking for near-misses   (precise)
    Tier 3 – LLM semantic validation for ambiguous hits (gold)

    Thread-safe for async use (single event loop).
    """

    def __init__(self, config: Optional[CacheConfig] = None):
        self.config = config or CacheConfig.from_env()
        self.metrics = CacheMetrics()
        self._backend = self._init_backend()
        logger.info(
            f"SemanticCache initialized | backend={'in-memory' if self.config.use_fakeredis else 'redis'} "
            f"| cosine_thresh={self.config.cosine_threshold}"
        )

    def _init_backend(self) -> InMemoryBackend | RedisBackend:
        if self.config.use_fakeredis:
            return InMemoryBackend(self.config.max_entries)
        try:
            return RedisBackend(
                self.config.redis_host,
                self.config.redis_port,
                self.config.redis_db,
                self.config.ttl_seconds,
            )
        except Exception:
            logger.warning("Falling back to in-memory cache backend.")
            return InMemoryBackend(self.config.max_entries)

    # ── Public API ────────────────────────────────────────────────────────

    async def get(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Look up a query in the cache. Returns the stored response or None.
        Updates internal metrics.
        """
        t0 = time.perf_counter()
        hit = await self._lookup(query)
        latency = (time.perf_counter() - t0) * 1000

        self.metrics.total_queries += 1
        self.metrics.latencies_ms.append(latency)

        if hit.hit and hit.entry:
            self.metrics.hits += 1
            self.metrics.tier_counts[hit.tier] = self.metrics.tier_counts.get(hit.tier, 0) + 1
            logger.debug(
                f"Cache HIT | tier={hit.tier} | sim={hit.similarity:.4f} "
                f"| latency={latency:.1f}ms | query='{query[:60]}'"
            )
            return hit.entry.response
        else:
            self.metrics.misses += 1
            logger.debug(f"Cache MISS | latency={latency:.1f}ms | query='{query[:60]}'")
            return None

    async def set(self, query: str, response: Dict[str, Any]) -> str:
        """Store a query-response pair. Returns the cache key."""
        key = content_hash(query)
        embedding = encode(query, self.config.bi_encoder)
        entry = CacheEntry(
            key=key,
            query=query,
            embedding=embedding.tolist(),
            response=response,
            ttl=self.config.ttl_seconds,
        )
        self._backend.set_entry(entry)
        logger.debug(f"Cache SET | key={key} | query='{query[:60]}'")
        return key

    async def invalidate(self, query: str) -> bool:
        """Remove a specific query from cache."""
        key = content_hash(query)
        if isinstance(self._backend, InMemoryBackend):
            if key in self._backend._store:
                del self._backend._store[key]
                return True
        return False

    def get_metrics(self) -> Dict:
        return {
            **self.metrics.to_dict(),
            "cache_size": self._backend.size(),
            "config": {
                "cosine_threshold": self.config.cosine_threshold,
                "cross_encoder_threshold": self.config.cross_encoder_threshold,
                "llm_validation_enabled": self.config.llm_validation_enabled,
                "backend": "in-memory" if self.config.use_fakeredis else "redis",
            },
        }

    def tune_threshold(self, target_precision: float = 0.90) -> float:
        """
        Adaptive threshold tuning based on observed threshold decisions.
        Adjusts cosine_threshold to meet target_precision.
        Returns recommended threshold.
        """
        decisions = self.metrics.threshold_decisions
        if len(decisions) < 5:
            return self.config.cosine_threshold

        # Find highest threshold where precision ≥ target
        by_sim = sorted(decisions, key=lambda d: d["similarity"])
        best_thresh = self.config.cosine_threshold

        for d in by_sim:
            hits_above = [x for x in decisions if x["similarity"] >= d["similarity"]]
            correct = sum(1 for x in hits_above if x["was_correct"])
            prec = correct / len(hits_above) if hits_above else 0
            if prec >= target_precision:
                best_thresh = d["similarity"]
                break

        logger.info(f"Threshold tuning: {self.config.cosine_threshold:.3f} → {best_thresh:.3f}")
        return best_thresh

    def record_feedback(self, query: str, similarity: float, was_correct: bool) -> None:
        """Record ground-truth feedback for precision/recall computation."""
        self.metrics.threshold_decisions.append({
            "query": query[:60],
            "similarity": similarity,
            "was_correct": was_correct,
            "timestamp": time.time(),
        })
        if was_correct:
            self.metrics.true_positives += 1
        else:
            self.metrics.false_positives += 1

    # ── Internal Lookup ───────────────────────────────────────────────────

    async def _lookup(self, query: str) -> CacheHit:
        t0 = time.perf_counter()

        # ── Tier 0: Exact hash match ──────────────────────────────────────
        if self.config.use_tier_0:
            key = content_hash(query)
            entry = self._backend.get_entry(key)
            if entry:
                return CacheHit(
                    hit=True, tier=0, similarity=1.0, entry=entry,
                    latency_ms=(time.perf_counter() - t0) * 1000,
                    validation_note="exact hash match",
                )

        # ── Tier 1: Cosine similarity search ─────────────────────────────
        if not self.config.use_tier_1:
            return CacheHit(hit=False, tier=-1, similarity=0.0, entry=None,
                            latency_ms=(time.perf_counter() - t0) * 1000)

        all_entries = self._backend.get_all_entries()
        if not all_entries:
            return CacheHit(hit=False, tier=-1, similarity=0.0, entry=None,
                            latency_ms=(time.perf_counter() - t0) * 1000)

        # Vectorized cosine search
        query_vec = encode(query, self.config.bi_encoder)
        corpus_vecs = np.array([e.embedding for e in all_entries], dtype=np.float32)
        similarities = batch_cosine_similarity(query_vec, corpus_vecs)
        best_idx = int(np.argmax(similarities))
        best_sim = float(similarities[best_idx])
        best_entry = all_entries[best_idx]

        # Fuzzy check as secondary gate (prevents embedding space collisions)
        fuzzy = _fuzzy_ratio(query, best_entry.query)

        if best_sim >= self.config.cosine_threshold and fuzzy >= self.config.fuzzy_threshold:
            return CacheHit(
                hit=True, tier=1, similarity=best_sim, entry=best_entry,
                latency_ms=(time.perf_counter() - t0) * 1000,
                validation_note=f"cosine={best_sim:.4f}, fuzzy={fuzzy:.4f}",
            )

        # ── Tier 2: Cross-encoder on near-misses ─────────────────────────
        in_near_miss_band = self.config.cosine_near_miss_low <= best_sim < self.config.cosine_threshold
        if self.config.use_tier_2 and in_near_miss_band:
            ce_score = await asyncio.get_event_loop().run_in_executor(
                None, cross_encode_score, query, best_entry.query, self.config.cross_encoder
            )
            # Normalize logit to 0-1 using sigmoid
            ce_normalized = 1 / (1 + np.exp(-ce_score))

            if ce_normalized >= self.config.cross_encoder_threshold:
                # ── Tier 3: LLM validation on ambiguous cross-enc hits ────
                if self.config.use_tier_3 and self.config.llm_validation_enabled:
                    valid, confidence, reason = await _llm_validate_hit(
                        query, best_entry.query,
                        model=self.config.llm_validator_model,
                        provider=self.config.llm_validator_provider,
                    )
                    if valid and confidence >= self.config.llm_validation_threshold:
                        return CacheHit(
                            hit=True, tier=3, similarity=best_sim, entry=best_entry,
                            latency_ms=(time.perf_counter() - t0) * 1000,
                            validation_note=f"LLM validated: conf={confidence:.2f}, {reason}",
                        )
                    return CacheHit(
                        hit=False, tier=-1, similarity=best_sim, entry=None,
                        latency_ms=(time.perf_counter() - t0) * 1000,
                        validation_note=f"LLM rejected: conf={confidence:.2f}, {reason}",
                    )

                return CacheHit(
                    hit=True, tier=2, similarity=best_sim, entry=best_entry,
                    latency_ms=(time.perf_counter() - t0) * 1000,
                    validation_note=f"cross-enc={ce_normalized:.4f}",
                )

        return CacheHit(
            hit=False, tier=-1, similarity=best_sim, entry=None,
            latency_ms=(time.perf_counter() - t0) * 1000,
            validation_note=f"best_cosine={best_sim:.4f} < threshold={self.config.cosine_threshold}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Convenience: Singleton cache for the ACHP pipeline
# ─────────────────────────────────────────────────────────────────────────────

_global_cache: Optional[SemanticCache] = None


def get_cache(config: Optional[CacheConfig] = None) -> SemanticCache:
    """Return (or initialize) the global singleton SemanticCache."""
    global _global_cache
    if _global_cache is None:
        _global_cache = SemanticCache(config)
    return _global_cache

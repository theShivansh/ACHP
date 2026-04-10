"""
ACHP Cache Package
Exports: SemanticCache, CacheConfig, CacheMetrics, get_cache
"""
from achp.cache.semantic_cache import (
    SemanticCache,
    CacheConfig,
    CacheMetrics,
    CacheEntry,
    CacheHit,
    InMemoryBackend,
    get_cache,
)
from achp.cache.embeddings import encode, cosine_similarity, content_hash

__all__ = [
    "SemanticCache", "CacheConfig", "CacheMetrics",
    "CacheEntry", "CacheHit", "InMemoryBackend", "get_cache",
    "encode", "cosine_similarity", "content_hash",
]

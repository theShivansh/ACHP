"""
ACHP — Embeddings Utility
Wraps sentence-transformers for semantic encoding.
Singleton pattern ensures model is loaded once per process.
"""
from __future__ import annotations

import hashlib
import logging
from functools import lru_cache
from typing import List

import numpy as np

logger = logging.getLogger(__name__)

# ── Lazy imports (avoid startup cost if not used) ─────────────────────────
def _load_sentence_transformer(model_name: str):
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(model_name)
    except ImportError:
        raise ImportError(
            "sentence-transformers not installed. Run: pip install sentence-transformers"
        )

def _load_cross_encoder(model_name: str):
    try:
        from sentence_transformers import CrossEncoder
        return CrossEncoder(model_name)
    except ImportError:
        raise ImportError(
            "sentence-transformers not installed. Run: pip install sentence-transformers"
        )


@lru_cache(maxsize=4)
def get_bi_encoder(model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
    """Singleton bi-encoder (fast embeddings)."""
    logger.info(f"Loading bi-encoder: {model_name}")
    return _load_sentence_transformer(model_name)


@lru_cache(maxsize=2)
def get_cross_encoder(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    """Singleton cross-encoder (precision reranking)."""
    logger.info(f"Loading cross-encoder: {model_name}")
    return _load_cross_encoder(model_name)


def encode(
    texts: List[str] | str,
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    normalize: bool = True,
) -> np.ndarray:
    """
    Encode one or more texts into dense vectors.

    Args:
        texts: Single string or list of strings.
        model_name: HuggingFace model identifier.
        normalize: L2-normalize embeddings (required for cosine similarity via dot product).

    Returns:
        np.ndarray of shape (n, dim) or (dim,) for a single string.
    """
    if isinstance(texts, str):
        texts = [texts]
        single = True
    else:
        single = False

    model = get_bi_encoder(model_name)
    embeddings = model.encode(
        texts,
        normalize_embeddings=normalize,
        show_progress_bar=False,
        batch_size=32,
    )
    return embeddings[0] if single else embeddings


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two L2-normalized vectors (dot product)."""
    return float(np.dot(a, b))


def batch_cosine_similarity(query: np.ndarray, corpus: np.ndarray) -> np.ndarray:
    """
    Efficient batch cosine similarity.
    query: (dim,)
    corpus: (n, dim)
    Returns: (n,) similarity scores
    """
    return corpus @ query


def cross_encode_score(query: str, document: str, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2") -> float:
    """
    Cross-encoder relevance score for high-precision reranking.
    Returns raw logit (higher = more relevant).
    """
    model = get_cross_encoder(model_name)
    score = model.predict([[query, document]])
    return float(score[0])


def content_hash(text: str) -> str:
    """Deterministic SHA-256 hash for exact-match cache key."""
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()[:16]

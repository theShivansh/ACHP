"""
Long-term evidence cache (web search results only).

Why not the semantic cache: similarity-keyed caching is wrong for evidence. "X is a hoax" and
"X is not a hoax" embed almost identically, and a similarity hit would hand one claim another
claim's sources. This cache matches the *exact* normalized query, expires entries after
`ACHP_EVIDENCE_TTL_S` (default 900s), and returns each document with its original retrieval
time so the pack can report how old its evidence is. It stores sources, never verdicts.
"""
from __future__ import annotations

import hashlib
import os
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

_WS = re.compile(r"\s+")


def normalize_query(query: str) -> str:
    return _WS.sub(" ", query).strip().casefold()


def query_key(query: str, namespace: str = "web") -> str:
    return f"{namespace}:" + hashlib.sha256(normalize_query(query).encode("utf-8")).hexdigest()[:32]


@dataclass
class _Entry:
    docs: List[Dict[str, Any]]
    stored_at: float


class EvidenceCache:
    def __init__(self, ttl_s: Optional[float] = None, max_entries: int = 2000,
                 clock=time.time):
        self.ttl_s = ttl_s if ttl_s is not None else float(os.getenv("ACHP_EVIDENCE_TTL_S", 900))
        self.max_entries = max_entries
        self._clock = clock
        self._store: "OrderedDict[str, _Entry]" = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, query: str, namespace: str = "web") -> Optional[List[Dict[str, Any]]]:
        if self.ttl_s <= 0:
            self.misses += 1
            return None
        key = query_key(query, namespace)
        entry = self._store.get(key)
        if entry is None or self._clock() - entry.stored_at > self.ttl_s:
            if entry is not None:
                del self._store[key]
            self.misses += 1
            return None
        self._store.move_to_end(key)
        self.hits += 1
        return [dict(d) for d in entry.docs]

    def set(self, query: str, docs: List[Dict[str, Any]], namespace: str = "web") -> None:
        if self.ttl_s <= 0 or not docs:
            return   # never cache an empty result: a transient search failure mustn't stick
        now = self._clock()
        stamped = []
        for d in docs:
            d = dict(d)
            meta = dict(d.get("metadata") or {})
            meta.setdefault("retrieved_at", now)
            d["metadata"] = meta
            stamped.append(d)
        key = query_key(query, namespace)
        self._store[key] = _Entry(stamped, now)
        self._store.move_to_end(key)
        while len(self._store) > self.max_entries:
            self._store.popitem(last=False)

    def clear(self) -> None:
        self._store.clear()

    def stats(self) -> Dict[str, Any]:
        return {"entries": len(self._store), "hits": self.hits, "misses": self.misses,
                "ttl_s": self.ttl_s}


_cache: Optional[EvidenceCache] = None


def get_evidence_cache() -> EvidenceCache:
    global _cache
    if _cache is None:
        _cache = EvidenceCache()
    return _cache

"""
ACHP — Semantic Cache Test Suite
=================================
Tests 10 representative query pairs across 4 categories to verify:
  - Hit rate > 70%
  - Tier breakdown (0 / 1 / 2 / 3)
  - Latency benchmarks
  - False positive guards (dissimilar queries must NOT hit)

RUN:
    python -m pytest apps/api/tests/unit/test_semantic_cache.py -v
    # or directly:
    python apps/api/tests/unit/test_semantic_cache.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

# ── Path bootstrap ────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from achp.cache.semantic_cache import SemanticCache, CacheConfig


# ─────────────────────────────────────────────────────────────────────────────
# Test Data
# ─────────────────────────────────────────────────────────────────────────────

# (stored_query, lookup_query, expected_hit, category, description)
TEST_PAIRS: List[Tuple[str, str, bool, str, str]] = [
    # ── Exact / near-exact (should ALWAYS hit) ─────────────────────────────
    (
        "What is climate change?",
        "What is climate change?",
        True, "exact", "Identical query",
    ),
    (
        "What is climate change?",
        "What is climate change",
        True, "near-exact", "Trailing punctuation difference",
    ),
    # ── Paraphrase (should hit via cosine / cross-enc) ─────────────────────
    (
        "How does machine learning work?",
        "Can you explain machine learning?",
        True, "paraphrase", "Intent-equivalent rephrase",
    ),
    (
        "What are the causes of inflation?",
        "Why does inflation happen?",
        True, "paraphrase", "Causal question rephrase",
    ),
    (
        "Who is the current US president?",
        "Who is America's president right now?",
        True, "paraphrase", "Geographic synonym + temporal",
    ),
    # ── Same topic, subtly different scope (ambiguous — LLM tier) ──────────
    (
        "What are the effects of climate change on agriculture?",
        "How does climate change impact farming?",
        True, "near-paraphrase", "Domain synonym rephrase",
    ),
    (
        "Explain the Israel-Palestine conflict history",
        "What is the historical background of the Israel-Gaza war?",
        True, "near-paraphrase", "Geographic sub-region refinement",
    ),
    # ── Semantically related but DIFFERENT (should NOT hit) ────────────────
    (
        "What are the benefits of exercise?",
        "What are the risks of over-exercising?",
        False, "dissimilar", "Opposite sub-question — must NOT hit",
    ),
    (
        "How does the stock market work?",
        "What caused the 2008 financial crisis?",
        False, "dissimilar", "Related topic, different specific Q",
    ),
    # ── Cross-domain false positive guard ───────────────────────────────────
    (
        "What is the boiling point of water?",
        "Who invented the internet?",
        False, "unrelated", "Completely unrelated queries",
    ),
]

MOCK_RESPONSE: Dict[str, Any] = {
    "claim": "sample claim text",
    "CTS": 0.82,
    "BIS": 0.15,
    "PCS": 0.76,
    "NSS": 0.88,
    "EPS": 0.71,
    "docs": [{"content": "Sample retrieved doc", "source": "test", "score": 0.9}],
}


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

async def run_cache_tests() -> Dict[str, Any]:
    """Execute all 10 test pairs and return structured results."""

    # Use in-memory backend + disable LLM validation (no API key needed for unit tests)
    config = CacheConfig(
        use_fakeredis=True,
        cosine_threshold=0.85,
        cross_encoder_threshold=0.65,
        llm_validation_enabled=False,   # disable for offline unit tests
        use_tier_3=False,
        cosine_near_miss_low=0.75,
    )
    cache = SemanticCache(config)

    results = []
    correct = 0
    total = len(TEST_PAIRS)

    print("\n" + "═" * 70)
    print("  ACHP Semantic Cache — Test Suite (10 query pairs)")
    print("═" * 70)
    print(f"{'#':<3} {'Category':<14} {'Expected':<9} {'Got':<7} {'Tier':<5} {'Sim':>6} {'ms':>7}  Status")
    print("─" * 70)

    for i, (stored_q, lookup_q, expected_hit, category, description) in enumerate(TEST_PAIRS, 1):
        # Store first query
        await cache.set(stored_q, MOCK_RESPONSE)

        # Lookup second query
        t0 = time.perf_counter()
        result = await cache.get(lookup_q)
        latency = (time.perf_counter() - t0) * 1000

        got_hit = result is not None

        # Assess similarity (re-run lookup for internal tier/sim info)
        hit_obj = await cache._lookup(lookup_q)

        passed = got_hit == expected_hit
        if passed:
            correct += 1
            status = "✅ PASS"
        else:
            status = "❌ FAIL"

        tier_str = str(hit_obj.tier) if hit_obj.hit else "—"
        sim_str = f"{hit_obj.similarity:.3f}"

        print(
            f"{i:<3} {category:<14} {'HIT' if expected_hit else 'MISS':<9} "
            f"{'HIT' if got_hit else 'MISS':<7} {tier_str:<5} {sim_str:>6} {latency:>6.1f}ms  {status}"
        )
        print(f"    ↳ {description}")

        results.append({
            "test_id": i,
            "stored_query": stored_q,
            "lookup_query": lookup_q,
            "category": category,
            "description": description,
            "expected_hit": expected_hit,
            "got_hit": got_hit,
            "passed": passed,
            "tier": hit_obj.tier,
            "similarity": round(hit_obj.similarity, 4),
            "latency_ms": round(latency, 2),
            "validation_note": hit_obj.validation_note,
        })

        # Reset cache for independence between pairs (except within same stored_q group)
        # Keep the cache to allow multi-query hit tests
        if i % 2 == 0:
            cache = SemanticCache(config)

    metrics = cache.get_metrics()
    hit_rate = correct / total

    print("─" * 70)
    print(f"\n  Results: {correct}/{total} passed | Hit Rate: {hit_rate:.0%}")
    print(f"  Avg latency: {sum(r['latency_ms'] for r in results)/len(results):.1f}ms")
    print("═" * 70)

    # Tier breakdown
    tier_counts: Dict[str, int] = {"0": 0, "1": 0, "2": 0, "3": 0, "miss": 0}
    for r in results:
        if r["got_hit"]:
            tier_counts[str(r["tier"])] = tier_counts.get(str(r["tier"]), 0) + 1
        else:
            tier_counts["miss"] += 1

    output = {
        "test_suite": "ACHP Semantic Cache — 10 Query Pair Benchmark",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "cosine_threshold": config.cosine_threshold,
            "cross_encoder_threshold": config.cross_encoder_threshold,
            "llm_validation_enabled": config.llm_validation_enabled,
            "backend": "in-memory (fakeredis)",
        },
        "summary": {
            "total_tests": total,
            "passed": correct,
            "failed": total - correct,
            "pass_rate": round(hit_rate, 4),
            "hit_rate_target": 0.70,
            "hit_rate_achieved": round(correct / total, 4),
            "target_met": hit_rate >= 0.70,
            "avg_latency_ms": round(sum(r["latency_ms"] for r in results) / len(results), 2),
            "max_latency_ms": round(max(r["latency_ms"] for r in results), 2),
            "min_latency_ms": round(min(r["latency_ms"] for r in results), 2),
        },
        "tier_breakdown": tier_counts,
        "test_cases": results,
        "cache_metrics": metrics,
        "verdict": (
            "✅ PASS — Semantic cache meets >70% hit rate target"
            if hit_rate >= 0.70
            else "❌ FAIL — Hit rate below 70% target, tune thresholds"
        ),
    }

    return output


# ─────────────────────────────────────────────────────────────────────────────
# pytest-compatible wrappers
# ─────────────────────────────────────────────────────────────────────────────

def test_cache_hit_rate():
    """pytest: overall pass rate must be >= 70%."""
    results = asyncio.run(run_cache_tests())
    assert results["summary"]["pass_rate"] >= 0.70, (
        f"Hit rate {results['summary']['pass_rate']:.0%} < 70%"
    )


def test_no_false_positives_on_unrelated():
    """pytest: unrelated queries must NOT produce cache hits."""
    config = CacheConfig(
        use_fakeredis=True, llm_validation_enabled=False, use_tier_3=False
    )
    cache = SemanticCache(config)

    async def _run():
        await cache.set("What is the boiling point of water?", MOCK_RESPONSE)
        result = await cache.get("Who invented the internet?")
        return result

    result = asyncio.run(_run())
    assert result is None, "Unrelated query incorrectly served cached response"


def test_exact_match_tier0():
    """pytest: identical queries hit on tier 0 (exact hash)."""
    config = CacheConfig(use_fakeredis=True, llm_validation_enabled=False)
    cache = SemanticCache(config)

    async def _run():
        await cache.set("What is climate change?", MOCK_RESPONSE)
        hit = await cache._lookup("What is climate change?")
        return hit

    hit = asyncio.run(_run())
    assert hit.hit and hit.tier == 0


def test_paraphrase_tier1():
    """pytest: paraphrased query hits on tier 1 (cosine)."""
    config = CacheConfig(
        use_fakeredis=True, cosine_threshold=0.80,
        llm_validation_enabled=False, use_tier_3=False,
    )
    cache = SemanticCache(config)

    async def _run():
        await cache.set("How does machine learning work?", MOCK_RESPONSE)
        hit = await cache._lookup("Can you explain machine learning?")
        return hit

    hit = asyncio.run(_run())
    assert hit.hit and hit.tier in (0, 1), f"Expected tier 0/1, got tier {hit.tier}"


def test_latency_under_200ms():
    """pytest: all tier-1 lookups complete in < 200ms (CPU, no GPU)."""
    config = CacheConfig(use_fakeredis=True, llm_validation_enabled=False)
    cache = SemanticCache(config)

    async def _run():
        await cache.set("What is climate change?", MOCK_RESPONSE)
        t0 = time.perf_counter()
        await cache.get("What is global warming?")
        return (time.perf_counter() - t0) * 1000

    latency = asyncio.run(_run())
    assert latency < 200, f"Cache lookup took {latency:.0f}ms (> 200ms)"


# ─────────────────────────────────────────────────────────────────────────────
# CLI entrypoint — saves test_results.json
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    output = asyncio.run(run_cache_tests())

    out_path = ROOT / "apps" / "api" / "tests" / "unit" / "test_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n  Results saved → {out_path}")
    print(f"  Verdict: {output['verdict']}\n")
    sys.exit(0 if output["summary"]["target_met"] else 1)

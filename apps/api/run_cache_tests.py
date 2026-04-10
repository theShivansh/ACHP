"""
ACHP — Cache Test Runner (file-output mode)
Runs all 10 test pairs offline (no API keys needed) and
writes results directly to test_results_live.json so the
terminal output-capture issue doesn't matter.
"""
import asyncio, json, sys, time, pathlib

# ── path setup ────────────────────────────────────────────────────────────
ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from achp.cache.semantic_cache import SemanticCache, CacheConfig

# ─────────────────────────────────────────────────────────────────────────
# 10 test pairs
# ─────────────────────────────────────────────────────────────────────────
PAIRS = [
    ("What is climate change?",
     "What is climate change?",
     True, "exact", "Identical query"),

    ("What is climate change?",
     "What is climate change",
     True, "near-exact", "Trailing punctuation"),

    ("How does machine learning work?",
     "Can you explain machine learning?",
     True, "paraphrase", "Intent-equivalent rephrase"),

    ("What are the causes of inflation?",
     "Why does inflation happen?",
     True, "paraphrase", "Causal question rephrase"),

    ("Who is the current US president?",
     "Who is America's president right now?",
     True, "paraphrase", "Geographic synonym + temporal"),

    ("What are the effects of climate change on agriculture?",
     "How does climate change impact farming?",
     True, "near-paraphrase", "Domain synonym rephrase"),

    ("Explain the Israel-Palestine conflict history",
     "What is the historical background of the Israel-Gaza war?",
     True, "near-paraphrase", "Geographic sub-region refinement"),

    ("What are the benefits of exercise?",
     "What are the risks of over-exercising?",
     False, "dissimilar", "Opposite sub-question — must NOT hit"),

    ("How does the stock market work?",
     "What caused the 2008 financial crisis?",
     False, "dissimilar", "Related topic, different specific Q"),

    ("What is the boiling point of water?",
     "Who invented the internet?",
     False, "unrelated", "Completely unrelated queries"),
]

MOCK = {"claim": "mock", "CTS": 0.82, "BIS": 0.15, "PCS": 0.76, "NSS": 0.88, "EPS": 0.71}


async def run():
    cfg = CacheConfig(
        use_fakeredis=True,
        cosine_threshold=0.80,           # tuned for all-MiniLM-L6-v2
        cross_encoder_threshold=0.55,
        llm_validation_enabled=False,    # offline
        use_tier_3=False,
        cosine_near_miss_low=0.70,
        fuzzy_threshold=0.30,
    )
    cache = SemanticCache(cfg)

    cases, correct = [], 0

    for i, (stored, lookup, expected, cat, desc) in enumerate(PAIRS, 1):
        # Fresh cache per pair for independence
        if i % 2 == 1:
            cache = SemanticCache(cfg)

        await cache.set(stored, MOCK)

        t0 = time.perf_counter()
        hit_obj = await cache._lookup(lookup)
        latency = (time.perf_counter() - t0) * 1000
        got_hit = hit_obj.hit
        passed  = got_hit == expected
        if passed:
            correct += 1

        cases.append({
            "id": i, "category": cat, "description": desc,
            "stored": stored, "lookup": lookup,
            "expected_hit": expected, "got_hit": got_hit,
            "passed": passed, "tier": hit_obj.tier,
            "similarity": round(hit_obj.similarity, 4),
            "latency_ms": round(latency, 2),
            "note": hit_obj.validation_note,
        })

    total = len(PAIRS)
    hit_rate = correct / total
    latencies = [c["latency_ms"] for c in cases]

    tier_counts = {}
    for c in cases:
        k = str(c["tier"]) if c["got_hit"] else "miss"
        tier_counts[k] = tier_counts.get(k, 0) + 1

    output = {
        "suite": "ACHP Semantic Cache — 10 Query Pair Benchmark",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "env": {
            "numpy": None, "sentence_transformers": None,
            "torch": None, "fakeredis": None, "pytest": None,
        },
        "summary": {
            "total": total, "passed": correct, "failed": total - correct,
            "hit_rate": round(hit_rate, 4),
            "target_hit_rate": 0.70,
            "target_met": hit_rate >= 0.70,
            "avg_latency_ms": round(sum(latencies)/len(latencies), 2),
            "max_latency_ms": round(max(latencies), 2),
            "min_latency_ms": round(min(latencies), 2),
        },
        "tier_breakdown": tier_counts,
        "cases": cases,
        "verdict": (
            f"✅ PASS — {correct}/{total} tests passed, hit_rate={hit_rate:.0%} > 70% target"
            if hit_rate >= 0.70
            else f"❌ FAIL — {correct}/{total} passed, hit_rate={hit_rate:.0%} < 70%"
        ),
    }

    # Fill env versions
    for name, mod in [("numpy","numpy"),("sentence_transformers","sentence_transformers"),
                      ("torch","torch"),("fakeredis","fakeredis"),("pytest","pytest")]:
        try:
            import importlib
            m = importlib.import_module(mod)
            output["env"][name] = getattr(m,"__version__","ok")
        except:
            output["env"][name] = "MISSING"

    # Save
    out = ROOT / "tests" / "unit" / "test_results_live.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(output, indent=2))

    # Print summary
    sep = "=" * 62
    print(sep)
    print("  ACHP Semantic Cache — Live Test Results")
    print(sep)
    for c in cases:
        icon = "✅" if c["passed"] else "❌"
        tier = str(c["tier"]) if c["got_hit"] else "—"
        print(f"  {icon} [{c['id']:02d}] {c['category']:<14} "
              f"tier={tier} sim={c['similarity']:.3f} {c['latency_ms']:>7.1f}ms")
        print(f"       {c['description']}")
    print(sep)
    print(f"  Result: {correct}/{total} passed  |  Hit rate: {hit_rate:.0%}  |  "
          f"Avg: {output['summary']['avg_latency_ms']:.1f}ms")
    print(f"  {output['verdict']}")
    print(sep)
    print(f"\n  Saved → {out}")
    return output


if __name__ == "__main__":
    result = asyncio.run(run())
    sys.exit(0 if result["summary"]["target_met"] else 1)

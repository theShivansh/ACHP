"""
ACHP — NIL Layer Test Suite
============================
7 real-world test cases covering the full narrative integrity spectrum.
Runs offline (no API keys needed) — uses VADER + local embeddings.
Writes deterministic, machine-verifiable results to test_suite_results.json.

Run: python run_nil_tests.py
"""
import asyncio, json, sys, time, pathlib, hashlib

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from achp.nil.nil_layer import NILLayer

# ─────────────────────────────────────────────────────────────────────────────
# 7 Test Cases — Real-world claims with known NIL properties
# ─────────────────────────────────────────────────────────────────────────────

TEST_CASES = [
    {
        "id": 1,
        "label": "climate_alarmism",
        "text": "Climate change is an EXISTENTIAL CRISIS destroying our planet — the government must act NOW or we face CATASTROPHIC COLLAPSE!",
        "expected": {
            "nil_verdict_in": ["biased","misleading","propaganda"],
            "BIS_gt": 0.20,
            "framing_score_gt": 0.10,
            "note": "High emotional loading, agenda words (must, now), alarm framing"
        }
    },
    {
        "id": 2,
        "label": "balanced_reporting",
        "text": "According to a 2024 IPCC report, global temperatures have risen approximately 1.1°C above pre-industrial levels. Scientists attribute this primarily to greenhouse gas emissions, though natural variability also plays a role.",
        "expected": {
            "nil_verdict_in": ["neutral","mildly_biased"],
            "BIS_lt": 0.35,
            "EPS_gt": 0.40,
            "note": "Hedging (approximately, primarily, also), cites source, acknowledges nuance"
        }
    },
    {
        "id": 3,
        "label": "political_propaganda",
        "text": "The radical left-wing regime is destroying our nation's values! Patriots must rise up and defend our heritage against these extremist socialist policies!",
        "expected": {
            "nil_verdict_in": ["misleading","propaganda"],
            "BIS_gt": 0.30,
            "framing_score_gt": 0.15,
            "note": "Extreme political framing, delegitimizing language, agenda words"
        }
    },
    {
        "id": 4,
        "label": "corporate_spin",
        "text": "Our revolutionary breakthrough product will transform the market and create unprecedented shareholder value through our innovative solution.",
        "expected": {
            "nil_verdict_in": ["mildly_biased","biased"],
            "BIS_gt": 0.10,
            "note": "Corporate bias, hype framing (revolutionary, breakthrough, unprecedented)"
        }
    },
    {
        "id": 5,
        "label": "scientific_hedging",
        "text": "Studies suggest that moderate exercise may reduce the risk of cardiovascular disease by approximately 30%, though researchers note that individual results could vary based on age and pre-existing conditions.",
        "expected": {
            "nil_verdict_in": ["neutral","mildly_biased"],
            "EPS_gt": 0.45,
            "BIS_lt": 0.30,
            "note": "Good hedging (suggest, may, approximately, could vary), cites variability"
        }
    },
    {
        "id": 6,
        "label": "conspiracy_theory",
        "text": "Obviously the mainstream media is covering up the truth that vaccines are dangerous. Everyone knows the government is lying and the pharmaceutical companies are corrupt criminals destroying our children.",
        "expected": {
            "nil_verdict_in": ["misleading","propaganda"],
            "BIS_gt": 0.25,
            "framing_score_gt": 0.15,
            "note": "Presuppositions (obviously, everyone knows), conspiracy framing, delegitimizing"
        }
    },
    {
        "id": 7,
        "label": "factual_neutral",
        "text": "The unemployment rate in the United States was 3.9% in January 2024, according to the Bureau of Labor Statistics.",
        "expected": {
            "nil_verdict_in": ["neutral","mildly_biased"],
            "BIS_lt": 0.30,
            "framing_score_lt": 0.25,
            "note": "Pure factual statement with cited source — should score neutral"
        }
    },
]


def _check(result: dict, expected: dict) -> tuple[bool, list[str]]:
    """Check result against expected criteria. Returns (pass, failures)."""
    failures = []
    verdict = result.get("nil_verdict", "")

    if "nil_verdict_in" in expected and verdict not in expected["nil_verdict_in"]:
        failures.append(f"verdict '{verdict}' not in {expected['nil_verdict_in']}")

    for metric in ["BIS","EPS","PCS","framing_score"]:
        val = result.get(metric, 0.0)
        if f"{metric}_gt" in expected and not (val > expected[f"{metric}_gt"]):
            failures.append(f"{metric}={val:.3f} not > {expected[f'{metric}_gt']}")
        if f"{metric}_lt" in expected and not (val < expected[f"{metric}_lt"]):
            failures.append(f"{metric}={val:.3f} not < {expected[f'{metric}_lt']}")

    return len(failures) == 0, failures


async def run_tests():
    layer   = NILLayer(use_groq_llm=False, use_openrouter=False)   # pure offline
    results = []
    passed  = 0
    sep     = "=" * 70

    print(f"\n{sep}")
    print("  ACHP NIL Layer — 7 Case Test Suite (Offline)")
    print(sep)

    t_suite = time.perf_counter()

    for tc in TEST_CASES:
        t0 = time.perf_counter()
        nil = await layer.run(tc["text"])
        elapsed = (time.perf_counter() - t0) * 1000

        serialized = layer.serialize(nil)
        ok, failures = _check(serialized, tc["expected"])
        if ok:
            passed += 1

        icon = "PASS" if ok else "FAIL"
        print(f"\n  [{icon}] Case {tc['id']} — {tc['label']}")
        print(f"  Verdict: {nil.nil_verdict} | BIS={nil.BIS:.3f} EPS={nil.EPS:.3f} PCS={nil.PCS:.3f}")
        print(f"  Framing: {nil.framing_score:.3f} | NIL={nil.nil_confidence:.3f}")
        print(f"  Wall: {nil.total_latency_ms:.0f}ms (parallel budget: {nil.parallel_budget_ms:.0f}ms)")
        if failures:
            for f in failures:
                print(f"    FAIL: {f}")

        results.append({
            "id":        tc["id"],
            "label":     tc["label"],
            "text":      tc["text"],
            "expected":  tc["expected"],
            "passed":    ok,
            "failures":  failures,
            **serialized,
            "test_latency_ms": round(elapsed, 2),
        })

    suite_ms = (time.perf_counter() - t_suite) * 1000

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{sep}")
    print(f"  Result: {passed}/{len(TEST_CASES)} passed | Suite time: {suite_ms:.0f}ms")

    latencies = [r["total_latency_ms"] for r in results]
    print(f"  Avg latency: {sum(latencies)/len(latencies):.0f}ms | "
          f"Max: {max(latencies):.0f}ms | Min: {min(latencies):.0f}ms")

    target_met = passed >= 5   # 5/7 = ~71% target
    print(f"  Target met (>=5/7): {'YES' if target_met else 'NO'}")
    print(sep + "\n")

    # ── Save artifact ─────────────────────────────────────────────────────
    output = {
        "suite":     "ACHP NIL Layer — 7 Case Test Suite",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode":      "offline (VADER + sentence-transformers, no API keys)",
        "summary": {
            "total":     len(TEST_CASES),
            "passed":    passed,
            "failed":    len(TEST_CASES) - passed,
            "pass_rate": round(passed / len(TEST_CASES), 4),
            "target":    ">=5/7 (71%)",
            "target_met": target_met,
            "suite_latency_ms": round(suite_ms, 2),
            "avg_latency_ms":   round(sum(latencies)/len(latencies), 2),
            "max_latency_ms":   round(max(latencies), 2),
        },
        "nil_layer_config": {
            "sub_agents": ["SentimentEPS","BiasDeepSeek","PerspectiveLlama","FramingCosine","ConfidenceSynthesizer"],
            "execution": "asyncio.gather (parallel)",
            "groq_llm":      False,
            "openrouter_llm": False,
            "embed_model":   "sentence-transformers/all-MiniLM-L6-v2",
        },
        "cases": results,
    }

    out_path = ROOT / "tests" / "unit" / "test_suite_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    print(f"  Saved -> {out_path}\n")
    return output


if __name__ == "__main__":
    asyncio.run(run_tests())

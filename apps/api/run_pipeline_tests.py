"""
ACHP — Core Pipeline End-to-End Tests
=======================================
3 real-world claims covering the verdict spectrum:
  Case 1: Climate hoax claim          → expected FALSE
  Case 2: Exercise + heart health     → expected MOSTLY_TRUE
  Case 3: Immigration + economy       → expected MOSTLY_FALSE / MIXED

All run in offline mode (no API keys needed), using:
  - Real Security Validator
  - Real NIL Layer (VADER + sentence-transformers)
  - Mock Retriever / Proposer / Adversaries / Judge

Full ACHPOutput format is validated on each case.
Writes demo_output.json artifact.
"""
import asyncio
import json
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)-8s %(name)s — %(message)s",
)

from achp.core.core_pipeline import CorePipeline

# ─────────────────────────────────────────────────────────────────────────────
# 3 End-to-End Test Cases
# ─────────────────────────────────────────────────────────────────────────────

TEST_CASES = [
    {
        "id": 1,
        "label": "climate_hoax",
        "query": "Climate change is a hoax created by the Chinese government to make U.S. manufacturing non-competitive.",
        "expected_verdict_in": ["FALSE", "MOSTLY_FALSE"],
        "expected_CTS_lt":     0.30,
        "expected_BIS_gt":     0.25,
        "expected_nil_in":     ["misleading","propaganda","biased"],
        "note": "Demonstrably false scientific claim with conspiracy framing and political motivation",
    },
    {
        "id": 2,
        "label": "exercise_heart",
        "query": "Regular exercise reduces the risk of cardiovascular disease by approximately 30 to 40 percent.",
        "expected_verdict_in": ["TRUE", "MOSTLY_TRUE"],
        "expected_CTS_gt":     0.60,
        "expected_EPS_gt":     0.50,
        "expected_nil_in":     ["neutral","mildly_biased"],
        "note": "Well-evidenced scientific claim with appropriate hedging",
    },
    {
        "id": 3,
        "label": "immigration_economy",
        "query": "Immigrants are destroying our economy and taking all the jobs from hard-working citizens.",
        "expected_verdict_in": ["FALSE", "MOSTLY_FALSE", "MIXED"],
        "expected_CTS_lt":     0.45,
        "expected_BIS_gt":     0.25,
        "expected_nil_in":     ["misleading","biased","propaganda"],
        "note": "Economically contested claim with strong delegitimizing framing",
    },
]


def _assert(result: dict, case: dict) -> tuple[bool, list[str]]:
    """Validate ACHPOutput against expected criteria."""
    failures = []

    # Verdict check
    v = result.get("verdict","")
    if v not in case["expected_verdict_in"]:
        failures.append(f"verdict '{v}' not in {case['expected_verdict_in']}")

    # NIL check
    nil_v = result.get("nil",{}).get("verdict","")
    if nil_v not in case["expected_nil_in"]:
        failures.append(f"nil_verdict '{nil_v}' not in {case['expected_nil_in']}")

    # Metric range checks
    m = result.get("metrics",{})
    for key, op, val in [
        ("CTS","lt",  case.get("expected_CTS_lt")),
        ("CTS","gt",  case.get("expected_CTS_gt")),
        ("BIS","gt",  case.get("expected_BIS_gt")),
        ("EPS","gt",  case.get("expected_EPS_gt")),
    ]:
        if val is None:
            continue
        mv = m.get(key, 0.0)
        if op == "lt" and not (mv < val):
            failures.append(f"{key}={mv:.3f} not < {val}")
        if op == "gt" and not (mv > val):
            failures.append(f"{key}={mv:.3f} not > {val}")

    # Schema completeness checks
    required = ["run_id","verdict","metrics","nil","atomic_claims",
                "adversary_a","adversary_b","consensus_reasoning",
                "key_evidence","pipeline","security"]
    for k in required:
        if k not in result:
            failures.append(f"missing required field: {k}")

    # Security pre/post safe
    sec = result.get("security",{})
    if not sec.get("pre_safe", True):
        failures.append("security pre_safe = False for valid input")
    if not sec.get("post_safe", True):
        failures.append("security post_safe = False for valid output")

    return len(failures) == 0, failures


async def run_e2e_tests():
    pipeline = CorePipeline(offline=True)
    results  = []
    passed   = 0

    SEP = "=" * 70
    print(f"\n{SEP}")
    print("  ACHP Core Pipeline — End-to-End Test Suite (3 Cases, Offline)")
    print(SEP)

    t_suite = time.perf_counter()

    for tc in TEST_CASES:
        print(f"\n  [Case {tc['id']}] {tc['label']}")
        print(f"  Query: {tc['query'][:75]}...")

        t0 = time.perf_counter()
        output = await pipeline.run(tc["query"])
        elapsed = (time.perf_counter() - t0) * 1000

        result_dict = output.model_dump()
        ok, failures = _assert(result_dict, tc)

        if ok:
            passed += 1
            icon = "PASS"
        else:
            icon = "FAIL"

        m = result_dict["metrics"]
        print(f"\n  [{icon}] Verdict: {output.verdict} ({output.verdict_confidence:.0%})")
        print(f"  Composite: {output.composite_score:.3f}")
        print(f"  CTS={m['CTS']:.3f}  PCS={m['PCS']:.3f}  BIS={m['BIS']:.3f}  "
              f"NSS={m['NSS']:.3f}  EPS={m['EPS']:.3f}")
        print(f"  NIL: {output.nil['verdict']} (conf={output.nil['confidence']:.2f})")
        print(f"  Debate rounds: {output.debate_rounds} | Latency: {elapsed:.0f}ms")
        print(f"  Cache hit: {output.pipeline['cache_hit']} | "
              f"Security: pre={output.security['pre_safe']} post={output.security['post_safe']}")

        if failures:
            for f in failures:
                print(f"    ✗ {f}")
        else:
            print(f"  ✓ All assertions passed")

        results.append({
            "id":       tc["id"],
            "label":    tc["label"],
            "query":    tc["query"],
            "expected": {
                "verdict_in":  tc["expected_verdict_in"],
                "nil_in":      tc["expected_nil_in"],
                "note":        tc["note"],
            },
            "passed":   ok,
            "failures": failures,
            "test_latency_ms": round(elapsed, 2),
            "output":   result_dict,
        })

    suite_ms = (time.perf_counter() - t_suite) * 1000

    # ── Summary ────────────────────────────────────────────────────────────
    latencies = [r["test_latency_ms"] for r in results]
    print(f"\n{SEP}")
    print(f"  Result:  {passed}/{len(TEST_CASES)} passed | Suite: {suite_ms:.0f}ms")
    print(f"  Latency: avg={sum(latencies)/len(latencies):.0f}ms "
          f"| max={max(latencies):.0f}ms | min={min(latencies):.0f}ms")
    target_met = passed >= 2
    print(f"  Target (>=2/3): {'YES ✓' if target_met else 'NO ✗'}")
    print(SEP + "\n")

    # ── Save demo_output.json ──────────────────────────────────────────────
    demo = {
        "suite":   "ACHP Core Pipeline — End-to-End Tests",
        "version": "1.0.0",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode":    "offline (VADER + all-MiniLM-L6-v2, mock LLM agents)",
        "summary": {
            "total": len(TEST_CASES),
            "passed": passed,
            "failed": len(TEST_CASES) - passed,
            "pass_rate": round(passed / len(TEST_CASES), 4),
            "target_met": target_met,
            "suite_latency_ms": round(suite_ms, 2),
            "avg_latency_ms":   round(sum(latencies)/len(latencies), 2),
        },
        "metric_formulas": {
            "CTS": "0.40·factual_A + 0.35·judge_CTS + 0.15·(1−BIS) + 0.10·EPS",
            "PCS": "0.50·pcs_B + 0.30·nil_pcs + 0.20·(1−min(missing/10,1))",
            "BIS": "0.55·nil_bis + 0.25·framing + 0.12·polarity_abs + frame_boost",
            "NSS": "0.40·(1−framing) + 0.35·narrative_alignment + 0.25·judge_NSS",
            "EPS": "0.70·vader_eps + 0.20·(1−framing) + 0.10·min(hedge×3,1)",
            "composite": "(CTS + PCS + (1−BIS) + NSS + EPS) / 5",
        },
        "pipeline_architecture": [
            "1. SecurityValidator.validate_input()       [sync ~1ms]",
            "2. RetrieverAgent.retrieve()                [async, cache-first]",
            "3. ProposerAgent.analyze()                  [async, Llama-4-Scout]",
            "4. AdversaryA.challenge()  ─┐ parallel     [async, DeepSeek R1]",
            "5. AdversaryB.audit()       ┤ asyncio       [async, Qwen 32B]",
            "6. NILLayer.run()          ─┘ .gather()    [async, 5 sub-agents]",
            "7. JudgeAgent.judge()                       [async, DeepSeek Chat]",
            "8. SecurityValidator.validate_output()      [sync ~1ms]",
        ],
        "cases": results,
    }

    out_path = ROOT / "tests" / "unit" / "demo_output.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(demo, indent=2, default=str))
    print(f"  Saved → {out_path}\n")
    return demo


if __name__ == "__main__":
    asyncio.run(run_e2e_tests())

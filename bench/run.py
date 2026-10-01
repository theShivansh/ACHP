"""Run ACHP Bench against a live ACHP backend and keep every run's full event log.

    python bench/run.py --api https://theshivansh-achp-api.hf.space --tag 2026-10-01
    python bench/run.py --suites safety,abstention --limit 5        # a quick pilot

Each item is checked through the public API exactly as the site does it (POST /runs, then the run's own
event log from GET /runs/{id}/events.json). The log is stored, gzipped, under bench/runs/<tag>/<suite>/<id>.json.gz,
so scoring (bench/score.py) never needs the network and anyone can re-score the same logs. Re-running the same tag
resumes: items that already have a finished log are skipped.

No verdict is ever made up here. A run that fails or times out is stored as such and scored as "no verdict".
Standard library only.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import gzip
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SUITES = ("averitec", "safety", "metamorphic", "abstention")
DEFAULT_API = "https://theshivansh-achp-api.hf.space"
UA = "achp-bench/1"


def _req(method: str, url: str, body: dict | None = None, timeout: float = 60) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", "user-agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def _with_retries(fn, attempts: int = 5):
    """Retry on 429, 5xx and network errors with backoff 2, 4, 8, 16s."""
    delay = 2.0
    last: object = None
    for i in range(attempts):
        try:
            status, body = fn()
            if status < 500 and status != 429:
                return status, body
            last = (status, body)
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last = e
        if i < attempts - 1:
            time.sleep(delay)
            delay *= 2
    if isinstance(last, tuple):
        return last
    raise RuntimeError(f"network: {last}")


def check(api: str, text: str, timeout_s: float = 300) -> dict:
    t0 = time.time()
    status, created = _with_retries(lambda: _req("POST", f"{api}/runs", {"input": {"type": "text", "text": text}}))
    if status != 202 or "run_id" not in created:
        return {"status": "error", "error": {"http": status, "body": created}, "wall_ms": int((time.time() - t0) * 1000)}
    run_id = created["run_id"]
    state = "running"
    while time.time() - t0 < timeout_s:
        _, snap = _with_retries(lambda: _req("GET", f"{api}/runs/{run_id}"))
        state = snap.get("status", state)
        if state not in ("running", "queued", "pending"):
            break
        time.sleep(2)
    _, log = _with_retries(lambda: _req("GET", f"{api}/runs/{run_id}/events.json"))
    return {
        "status": state if state in ("completed", "failed") else "timeout",
        "run_id": run_id,
        "wall_ms": int((time.time() - t0) * 1000),
        "events": log.get("events", []),
    }


def _failure(rec: dict) -> dict | None:
    for e in rec.get("events", []):
        if e.get("type") == "run.failed":
            return e.get("data")
    return rec.get("error")


def _quota_failed(tag: str, item: dict) -> bool:
    rec = _previous(_dest(tag, item)) or {}
    f = _failure(rec) or {}
    return rec.get("status") == "failed" and f.get("error_code") == "exhausted"


def load_suite(name: str) -> list[dict]:
    p = HERE / "suites" / f"{name}.jsonl"
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def _dest(tag: str, item: dict) -> Path:
    return HERE / "runs" / tag / item["suite"] / f"{item['id']}.json.gz"


def _previous(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(gzip.decompress(path.read_bytes()))
    except Exception:
        return None


def run_item(api: str, tag: str, item: dict, retry_failed: bool = False) -> str:
    """One check. A finished log is kept; with retry_failed, a failed, errored or timed-out one is tried again and
    the earlier attempt is kept under previous_attempts (the scorer reports first-attempt completion from it)."""
    dest = _dest(tag, item)
    prev = _previous(dest)
    if prev and (prev.get("status") == "completed" or (prev.get("status") == "failed" and not retry_failed)):
        return "skip"
    if prev and prev.get("status") in ("error", "timeout") and not retry_failed:
        return "skip"
    try:
        res = check(api, item["text"])
    except Exception as e:  # stored, scored as no verdict
        res = {"status": "error", "error": {"exception": str(e)}}
    rec = {"item": item, "api": api, "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **res}
    if prev:
        earlier = prev.pop("previous_attempts", [])
        prev.pop("item", None)
        rec["previous_attempts"] = earlier + [{k: v for k, v in prev.items() if k != "events"} | {"failure": _failure(prev)}]
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(gzip.compress(json.dumps(rec, ensure_ascii=False).encode("utf-8"), mtime=0))
    return res["status"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=DEFAULT_API)
    ap.add_argument("--tag", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    ap.add_argument("--suites", default=",".join(SUITES))
    ap.add_argument("--limit", type=int, default=0, help="at most N items per suite (0 = all)")
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--retry-failed", action="store_true", help="try failed, errored and timed-out items again")
    ap.add_argument("--max-checks", type=int, default=0, help="stop after this many new checks (0 = no cap); a daily budget")
    ap.add_argument("--stop-after-quota-failures", type=int, default=3,
                    help="stop when this many checks in a row fail because the model quota ran out (0 = never)")
    args = ap.parse_args()
    api = args.api.rstrip("/")

    _, health = _with_retries(lambda: _req("GET", f"{api}/health"))
    meta_path = HERE / "runs" / args.tag / "meta.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    if not meta_path.exists():
        meta_path.write_text(json.dumps({"api": api, "tag": args.tag, "health_at_start": health,
                                         "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, indent=2) + "\n",
                             encoding="utf-8")

    items: list[dict] = []
    for s in args.suites.split(","):
        rows = load_suite(s.strip())
        items.extend(rows[: args.limit] if args.limit else rows)

    counts: dict[str, int] = {}
    # One check at a time when guarded, so the run can stop the moment the backend's model quota runs out instead of
    # recording a long tail of failures (and leaving the live site without quota).
    workers = 1 if (args.stop_after_quota_failures or args.max_checks) else max(1, args.concurrency)
    quota_streak = 0
    new_checks = 0
    stopped = ""
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {}
        pending = list(items)
        n = 0
        while pending or futs:
            while pending and len(futs) < workers and not stopped:
                it = pending.pop(0)
                futs[pool.submit(run_item, api, args.tag, it, args.retry_failed)] = it
            if not futs:
                break
            done, _ = cf.wait(futs, return_when=cf.FIRST_COMPLETED)
            for f in done:
                it = futs.pop(f)
                st = f.result()
                n += 1
                counts[st] = counts.get(st, 0) + 1
                print(f"[{n}/{len(items)}] {it['suite']}/{it['id']}: {st}", flush=True)
                if st == "skip":
                    continue
                new_checks += 1
                quota_streak = quota_streak + 1 if _quota_failed(args.tag, it) else 0
                if args.stop_after_quota_failures and quota_streak >= args.stop_after_quota_failures:
                    stopped = f"{quota_streak} checks in a row failed because the model quota ran out"
                elif args.max_checks and new_checks >= args.max_checks:
                    stopped = f"reached --max-checks {args.max_checks}"
            if stopped:
                pending = []
    if stopped:
        print(f"stopped: {stopped}. Resume later with the same --tag and --retry-failed.", flush=True)
    print("done", json.dumps(counts))


if __name__ == "__main__":
    main()

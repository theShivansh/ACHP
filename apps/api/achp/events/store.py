"""
Persisted run log (06 §6): `runs` + `events`, SQLite by default.

`seq` is assigned inside the store's write transaction (`MAX(seq)+1` under a lock), so it is gapless
per run even with concurrent emitters, and `PRIMARY KEY(run_id, seq)` makes a duplicate impossible.
The database lives in `ACHP_DATA_DIR` (default `./.data`). Runs older than the TTL (72h) are
deleted on startup.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol


RUN_TTL_S = 72 * 3600
_TERMINAL = ("run.completed", "run.failed")


class RunEnded(RuntimeError):
    """The run's log already ends with run.completed / run.failed; nothing may follow."""


@dataclass
class RunRecord:
    run_id: str
    status: str              # queued | running | completed | failed
    created_at: float
    started_at: Optional[float]
    input: Dict[str, Any]
    result: Optional[Dict[str, Any]]
    error: Optional[Dict[str, Any]]
    last_seq: int


@dataclass
class StoredEvent:
    run_id: str
    seq: int
    ts: float
    t_ms: int
    type: str
    agent: Optional[str]
    data: Dict[str, Any]


class EventStore(Protocol):
    def create_run(self, run_id: str, input: Dict[str, Any]) -> None: ...
    def append(self, run_id: str, type: str, agent: Optional[str], data: Dict[str, Any]) -> StoredEvent: ...
    def events(self, run_id: str, after_seq: int = 0) -> List[StoredEvent]: ...
    def get_run(self, run_id: str) -> Optional[RunRecord]: ...
    def set_status(self, run_id: str, status: str, *, result: Optional[Dict[str, Any]] = None,
                   error: Optional[Dict[str, Any]] = None) -> None: ...
    def cleanup(self, ttl_s: float = RUN_TTL_S) -> int: ...


_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id      TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    input_json  TEXT NOT NULL,
    result_json TEXT,
    error_json  TEXT,
    created_at  REAL NOT NULL,
    started_at  REAL
);
CREATE TABLE IF NOT EXISTS events (
    run_id    TEXT NOT NULL,
    seq       INTEGER NOT NULL,
    ts        REAL NOT NULL,
    t_ms      INTEGER NOT NULL,
    type      TEXT NOT NULL,
    agent     TEXT,
    data_json TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS runs_created ON runs(created_at);
"""


def default_db_path() -> Path:
    return Path(os.getenv("ACHP_DATA_DIR", "./.data")) / "runs.sqlite3"


class SQLiteEventStore:
    def __init__(self, path: Optional[os.PathLike | str] = None):
        self.path = str(path) if path is not None else str(default_db_path())
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        if self.path != ":memory:":
            self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.executescript(_SCHEMA)

    # ── runs ─────────────────────────────────────────────────────────────

    def create_run(self, run_id: str, input: Dict[str, Any]) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO runs(run_id, status, input_json, created_at) VALUES (?, 'queued', ?, ?)",
                (run_id, json.dumps(input, ensure_ascii=False), time.time()),
            )

    def get_run(self, run_id: str) -> Optional[RunRecord]:
        with self._lock:
            row = self._db.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
            if row is None:
                return None
            last = self._db.execute("SELECT COALESCE(MAX(seq), 0) FROM events WHERE run_id = ?",
                                    (run_id,)).fetchone()[0]
        return RunRecord(
            run_id=row["run_id"], status=row["status"], created_at=row["created_at"],
            started_at=row["started_at"], input=json.loads(row["input_json"]),
            result=json.loads(row["result_json"]) if row["result_json"] else None,
            error=json.loads(row["error_json"]) if row["error_json"] else None,
            last_seq=int(last),
        )

    def set_status(self, run_id: str, status: str, *, result: Optional[Dict[str, Any]] = None,
                   error: Optional[Dict[str, Any]] = None) -> None:
        with self._lock:
            self._db.execute(
                "UPDATE runs SET status = ?, result_json = COALESCE(?, result_json), "
                "error_json = COALESCE(?, error_json) WHERE run_id = ?",
                (status,
                 json.dumps(result, ensure_ascii=False) if result is not None else None,
                 json.dumps(error, ensure_ascii=False) if error is not None else None,
                 run_id),
            )

    # ── events ───────────────────────────────────────────────────────────

    def append(self, run_id: str, type: str, agent: Optional[str], data: Dict[str, Any]) -> StoredEvent:
        now = time.time()
        payload = json.dumps(data, ensure_ascii=False)
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                row = self._db.execute("SELECT started_at FROM runs WHERE run_id = ?", (run_id,)).fetchone()
                if row is None:
                    raise KeyError(run_id)
                started = row["started_at"]
                if type == "run.started" and started is None:
                    started = now
                    self._db.execute("UPDATE runs SET started_at = ?, status = 'running' WHERE run_id = ?",
                                     (now, run_id))
                tail = self._db.execute("SELECT seq, type FROM events WHERE run_id = ? ORDER BY seq DESC LIMIT 1",
                                        (run_id,)).fetchone()
                if tail is not None and tail["type"] in _TERMINAL:
                    raise RunEnded(f"{run_id} already ended with {tail['type']}; {type} was not logged")
                seq = (tail["seq"] if tail is not None else 0) + 1
                t_ms = int(round((now - started) * 1000)) if started is not None else 0
                self._db.execute(
                    "INSERT INTO events(run_id, seq, ts, t_ms, type, agent, data_json) VALUES (?,?,?,?,?,?,?)",
                    (run_id, seq, now, max(0, t_ms), type, agent, payload),
                )
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return StoredEvent(run_id, int(seq), now, max(0, t_ms), type, agent, data)

    def events(self, run_id: str, after_seq: int = 0) -> List[StoredEvent]:
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq", (run_id, after_seq),
            ).fetchall()
        return [StoredEvent(r["run_id"], r["seq"], r["ts"], r["t_ms"], r["type"], r["agent"],
                            json.loads(r["data_json"])) for r in rows]

    # ── housekeeping ─────────────────────────────────────────────────────

    def cleanup(self, ttl_s: float = RUN_TTL_S) -> int:
        cutoff = time.time() - ttl_s
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                old = [r[0] for r in self._db.execute("SELECT run_id FROM runs WHERE created_at < ?", (cutoff,))]
                self._db.executemany("DELETE FROM events WHERE run_id = ?", [(r,) for r in old])
                self._db.executemany("DELETE FROM runs WHERE run_id = ?", [(r,) for r in old])
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return len(old)

    def unfinished_runs(self) -> List[str]:
        with self._lock:
            return [r[0] for r in self._db.execute("SELECT run_id FROM runs WHERE status IN ('queued','running')")]

    def last_event(self, run_id: str) -> Optional[StoredEvent]:
        with self._lock:
            r = self._db.execute("SELECT * FROM events WHERE run_id = ? ORDER BY seq DESC LIMIT 1",
                                 (run_id,)).fetchone()
        if r is None:
            return None
        return StoredEvent(r["run_id"], r["seq"], r["ts"], r["t_ms"], r["type"], r["agent"],
                           json.loads(r["data_json"]))

    def close(self) -> None:
        with self._lock:
            self._db.close()

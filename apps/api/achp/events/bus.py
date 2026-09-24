"""
RunEventBus (06 §6): the append-only per-run log plus fan-out to live subscribers.

- `emit` validates the payload against the protocol model, appends it to the store (which assigns
  the gapless seq) and pushes it to every live subscriber of that run.
- `subscribe` registers a live queue *first*, then replays the backlog after `after_seq`, then
  streams live events, skipping anything already replayed. It ends after a terminal event. With
  `ping_s` it yields `None` after that many idle seconds so the SSE layer can send `: ping`.
- `start` runs a pipeline coroutine as a background task with a strong reference, behind a
  concurrency semaphore (`ACHP_MAX_CONCURRENT_RUNS`, default 3). A run that has to wait emits
  `run.queued`. Any exception the coroutine lets escape becomes `run.failed`.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional, Set

from achp.events.models import TERMINAL_TYPES, Event, validate_payload
from achp.events.notes import failure_message
from achp.events.store import EventStore, RunEnded, SQLiteEventStore, StoredEvent  # noqa: F401

logger = logging.getLogger(__name__)

_RUN_ID = re.compile(r"^[A-Za-z0-9_-]{4,64}$")


def new_run_id() -> str:
    return f"r_{uuid.uuid4().hex[:10]}"


def valid_run_id(run_id: str) -> bool:
    return bool(_RUN_ID.match(run_id or ""))


def to_event(e: StoredEvent) -> Event:
    ts = datetime.fromtimestamp(e.ts, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return Event(run_id=e.run_id, seq=e.seq, ts=ts, t_ms=e.t_ms, type=e.type, agent=e.agent, data=e.data)


class RunNotFound(KeyError):
    pass


class RunEventBus:
    def __init__(self, store: Optional[EventStore] = None, max_concurrent: Optional[int] = None):
        self.store: EventStore = store or SQLiteEventStore()
        limit = max_concurrent or int(os.getenv("ACHP_MAX_CONCURRENT_RUNS", 3))
        self._sem = asyncio.Semaphore(max(1, limit))
        self._subs: Dict[str, Set[asyncio.Queue]] = {}
        self._tasks: Dict[str, asyncio.Task] = {}      # strong references (asyncio keeps weak ones)
        self._waiting: List[str] = []

    # ── runs ─────────────────────────────────────────────────────────────

    def create_run(self, input: Dict[str, Any], run_id: Optional[str] = None) -> str:
        run_id = run_id if run_id and valid_run_id(run_id) and not self.store.get_run(run_id) else new_run_id()
        self.store.create_run(run_id, input)
        return run_id

    def get_run(self, run_id: str):
        return self.store.get_run(run_id)

    def task(self, run_id: str) -> Optional[asyncio.Task]:
        return self._tasks.get(run_id)

    # ── emit / replay / subscribe ────────────────────────────────────────

    async def emit(self, run_id: str, type: str, agent: Optional[str], data: Dict[str, Any]) -> Event:
        clean = validate_payload(type, data)
        stored = self.store.append(run_id, type, agent, clean)
        event = to_event(stored)
        for q in list(self._subs.get(run_id, ())):
            q.put_nowait(event)
        if event.terminal:
            record = self.store.get_run(run_id)
            if record and record.status not in ("completed", "failed"):
                self.store.set_status(run_id, "completed" if type == "run.completed" else "failed")
        return event

    def events(self, run_id: str, after_seq: int = 0) -> List[Event]:
        if self.store.get_run(run_id) is None:
            raise RunNotFound(run_id)
        return [to_event(e) for e in self.store.events(run_id, after_seq)]

    async def subscribe(self, run_id: str, after_seq: int = 0,
                        ping_s: Optional[float] = None) -> AsyncIterator[Optional[Event]]:
        if self.store.get_run(run_id) is None:
            raise RunNotFound(run_id)
        q: asyncio.Queue = asyncio.Queue()
        self._subs.setdefault(run_id, set()).add(q)
        # A cursor past the end of the log can't skip events that haven't happened yet.
        after_seq = min(after_seq, self.store.get_run(run_id).last_seq)
        last = after_seq
        try:
            for e in self.store.events(run_id, after_seq):
                ev = to_event(e)
                last = ev.seq
                yield ev
                if ev.terminal:
                    return
            tail = self.store.last_event(run_id)
            if tail is not None and tail.seq <= last and tail.type in TERMINAL_TYPES:
                return  # resumed at or after the end of a finished log: nothing more will come
            while True:
                try:
                    ev = await (asyncio.wait_for(q.get(), ping_s) if ping_s else q.get())
                except asyncio.TimeoutError:
                    yield None
                    continue
                if ev.seq <= last:
                    continue
                if ev.seq > last + 1:
                    # A live event overtook the backlog read; fill the gap from the store.
                    for e in self.store.events(run_id, last):
                        if e.seq >= ev.seq:
                            break
                        gap = to_event(e)
                        last = gap.seq
                        yield gap
                last = ev.seq
                yield ev
                if ev.terminal:
                    return
        finally:
            subs = self._subs.get(run_id)
            if subs is not None:
                subs.discard(q)
                if not subs:
                    self._subs.pop(run_id, None)

    # ── scheduling ───────────────────────────────────────────────────────

    def start(self, run_id: str, work: Callable[[], Awaitable[Any]]) -> asyncio.Task:
        task = asyncio.create_task(self._guarded(run_id, work), name=f"run:{run_id}")
        self._tasks[run_id] = task
        task.add_done_callback(lambda _t, rid=run_id: self._tasks.pop(rid, None))
        return task

    async def _guarded(self, run_id: str, work: Callable[[], Awaitable[Any]]) -> Any:
        if self._sem.locked():
            self._waiting.append(run_id)
            try:
                await self.emit(run_id, "run.queued", None, {"position": len(self._waiting)})
            except Exception:  # never let a log write stop the run from queueing
                logger.exception("[%s] run.queued emit failed", run_id)
        try:
            async with self._sem:
                if run_id in self._waiting:
                    self._waiting.remove(run_id)
                    await self._requeue()
                try:
                    return await work()
                except asyncio.CancelledError:
                    await self._fail(run_id, "server", "cancelled", failure_message("server", "cancelled"), True)
                    raise
                except Exception as e:  # the pipeline wrapper emits run.failed itself; this is the backstop
                    logger.exception("[%s] run crashed: %s", run_id, e)
                    await self._fail(run_id, "internal", "internal_error",
                                     failure_message("internal", "internal_error"), True)
                    return None
        finally:
            if run_id in self._waiting:      # cancelled while waiting: the runs behind it move up
                self._waiting.remove(run_id)
                await self._requeue()

    async def _requeue(self) -> None:
        """The queue moved: tell each waiting run its new position."""
        for i, rid in enumerate(list(self._waiting), start=1):
            try:
                await self.emit(rid, "run.queued", None, {"position": i})
            except Exception:
                logger.exception("[%s] run.queued emit failed", rid)

    async def close_interrupted(self) -> int:
        """Runs left queued/running by a previous process can't finish; close them honestly."""
        ids = self.store.unfinished_runs()
        for rid in ids:
            await self._fail(rid, "server", "server_restarted", failure_message("server", "server_restarted"), True)
        return len(ids)

    async def _fail(self, run_id: str, stage: str, code: str, message: str, retryable: bool) -> None:
        # Decided by the log, not the status column: a run stored as completed whose
        # run.completed never made it out is still open and must end in run.failed.
        if self.store.get_run(run_id) is None or self.store.ended(run_id):
            return
        await self.emit(run_id, "run.failed", None,
                        {"stage": stage, "error_code": code, "message": message, "retryable": retryable})
        self.store.set_status(run_id, "failed", clear_result=True,
                              error={"stage": stage, "error_code": code, "message": message, "retryable": retryable})


_bus: Optional[RunEventBus] = None


def get_bus() -> RunEventBus:
    global _bus
    if _bus is None:
        _bus = RunEventBus()
    return _bus


def set_bus(bus: Optional[RunEventBus]) -> None:
    global _bus
    _bus = bus

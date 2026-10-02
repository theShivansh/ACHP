"""findings.recorded: what each reviewer concluded, held until the verdict and never carrying reasoning or links."""
from types import SimpleNamespace

from achp.events import RunEventBus, RunEvents, SQLiteEventStore
from tests.events.test_emissions import run_logged, types


def findings(log):
    return next(e for e in log if e["type"] == "findings.recorded")


async def test_the_conclusions_are_logged_just_before_the_verdict():
    _, log = await run_logged()
    t = types(log)
    assert t.index("findings.recorded") == t.index("verdict.final") - 1
    d = findings(log)["data"]
    assert set(d) == {"challenger", "auditor", "integrity"}
    assert d["challenger"]["held"] + d["challenger"]["failed"] + d["challenger"]["unsettled"] >= 1
    assert d["auditor"]["stance"] and d["integrity"]["verdict"]
    assert findings(log)["agent"] is None


async def test_a_run_that_fails_after_the_findings_were_held_never_logs_them():
    bus = RunEventBus(SQLiteEventStore(":memory:"))
    rid = bus.create_run({"type": "text", "text": "x"})
    ev = RunEvents(bus, rid)
    ev.hold_findings(flaws=["A flaw."], held=0, failed=1, unsettled=0, stance="balanced", missing=[], represented=[],
                     integrity_verdict="NEUTRAL", integrity_summary="")
    await ev.fail("judge", "internal_error", "The check could not finish.", False)
    assert "findings.recorded" not in [e.type for e in bus.events(rid)]


async def test_a_judge_failure_logs_no_findings_and_no_verdict():
    from achp.llm.runtime import TransportError
    from tests.fakes import RoleTransport

    _, log = await run_logged(RoleTransport(fail={"JudgeOutput": TransportError(500, "upstream down")}))
    assert "findings.recorded" not in types(log) and "verdict.final" not in types(log)


def _events():
    bus = RunEventBus(SQLiteEventStore(":memory:"))
    rid = bus.create_run({"type": "text", "text": "x"})
    return bus, rid, RunEvents(bus, rid)


def test_text_that_links_out_or_narrates_a_process_is_dropped_and_limits_hold():
    _, _, ev = _events()
    miss = [
        SimpleNamespace(stakeholder="Shift workers", viewpoint="Irregular schedules make 7 hours hard.", significance=0.8),
        SimpleNamespace(stakeholder="Visit https://evil.example", viewpoint="Click here.", significance=0.9),
        SimpleNamespace(stakeholder="Doctors", viewpoint="Let me think about this step 2.", significance=0.5),
        {"stakeholder": "Carers", "viewpoint": "x" * 400, "significance": 7},
    ]
    d = ev.hold_findings(
        flaws=["A deterministic claim without support.", "See www.bad.com for more", "I think this is wrong", ""],
        held=1, failed=2, unsettled=0, stance="SKEWED_LEFT", missing=miss, represented=["Patients", "http://x.org"],
        integrity_verdict="MISLEADING", integrity_summary="NIL verdict: misleading.",
    )
    assert d["challenger"]["flaws"] == ["A deterministic claim without support."]
    assert [m["who"] for m in d["auditor"]["missing"]] == ["Shift workers", "Carers"]
    carers = d["auditor"]["missing"][1]
    assert len(carers["viewpoint"]) <= 240 and carers["significance"] == 1.0  # clipped, clamped
    assert d["auditor"]["represented"] == ["Patients"]
    assert d["integrity"] == {"verdict": "MISLEADING", "summary": "NIL verdict: misleading."}


def test_bad_input_never_raises():
    _, _, ev = _events()
    assert ev.hold_findings(flaws=None, held=0, failed=0, unsettled=0, stance=None, missing=None, represented=None,
                            integrity_verdict=None, integrity_summary=None)["auditor"]["stance"] == "unknown"

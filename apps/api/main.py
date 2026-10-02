"""
ACHP — Production FastAPI Backend  (main.py)
=============================================
Python 3.12 + Uvicorn

Endpoints
─────────
GET  /health                       → liveness probe
GET  /docs                         → auto Swagger UI (FastAPI built-in)
GET  /redoc                        → ReDoc UI

POST /kb/upload                    → ingest files / URLs / raw text → kb_id
GET  /kb/list                      → list all knowledge bases

POST /runs                         → start a run, 202 {run_id, events_url, case_url}
GET  /runs/{id}/events             → SSE event log v2 (Last-Event-ID / ?since= resume)
GET  /runs/{id}                    → run snapshot
GET  /runs/{id}/events.json        → the full event log
POST /analyze                      → compatibility wrapper: a run, awaited, same response shape
GET  /analyze/{run_id}/stream      → alias of /runs/{id}/events

CORS is fully enabled for Next.js frontend (http://localhost:3000 + http://localhost:3001).
"""
from __future__ import annotations

# ── Load .env FIRST — before any os.getenv() calls ───────────────────────────
# This fixes the VS Code "python.terminal.useEnvFile" disabled warning.
# python-dotenv loads .env from the current working directory (apps/api/).
import sys as _sys
from pathlib import Path as _Path
try:
    from dotenv import load_dotenv as _load_dotenv
    # Search: apps/api/.env → repo root .env → fallback silently
    _env_file = _Path(__file__).parent / ".env"
    if not _env_file.exists():
        _env_file = _Path(__file__).parent.parent.parent / ".env"
    if _env_file.exists():
        # encoding='utf-8-sig' strips BOM \ufeff so line-1 keys parse correctly
        _load_dotenv(dotenv_path=_env_file, override=True, encoding='utf-8-sig')
        print(f"[ACHP] Loaded env from: {_env_file}", file=_sys.stderr)
    else:
        print("[ACHP] No .env file found — using OS environment only", file=_sys.stderr)
except ImportError:
    print("[ACHP] python-dotenv not installed — run: pip install python-dotenv", file=_sys.stderr)
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import uvicorn
from fastapi import (
    BackgroundTasks, Body, Depends, FastAPI, File, Form, HTTPException,
    Query, Request, UploadFile, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

_log_level = os.getenv("ACHP_LOG_LEVEL", "INFO").strip().upper()
# Guard: fall back to INFO if secret has unexpected value (e.g. '\tINFO' from HF Spaces)
if _log_level not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
    _log_level = "INFO"

logging.basicConfig(
    level=_log_level,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("achp.main")

# ─────────────────────────────────────────────────────────────────────────────
# Lazy pipeline singleton
# ─────────────────────────────────────────────────────────────────────────────

_pipeline = None
_STARTED = time.monotonic()

def get_pipeline():
    global _pipeline
    has_key = bool(os.getenv("GROQ_API_KEY", "").strip())
    # Rebuild if the key appeared after an earlier request pinned the pipeline to "no key".
    if _pipeline is None or (_pipeline.offline and has_key):
        from achp.core.core_pipeline import CorePipeline
        offline = not has_key
        logger.info(f"Initialising CorePipeline | offline={offline}")
        _pipeline = CorePipeline(offline=offline)
    return _pipeline


# ─────────────────────────────────────────────────────────────────────────────
# KB manager singleton
# ─────────────────────────────────────────────────────────────────────────────

from achp.kb.store import kb_manager

# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ACHP API starting up …")
    from achp.events import get_bus
    try:
        bus = get_bus()
        removed = bus.store.cleanup()
        closed = await bus.close_interrupted()
        logger.info(f"Event store ready | expired runs removed={removed} | interrupted runs closed={closed}")
    except Exception as e:
        logger.warning(f"Event store housekeeping failed: {e}")
    # Warm up pipeline at startup (loads agents in background)
    app.state.warmup = asyncio.create_task(_warmup())
    yield
    logger.info("ACHP API shutting down.")


async def _warmup():
    """Warm up pipeline without blocking startup — only if API keys are present."""
    global _pipeline
    try:
        await asyncio.sleep(1.0)  # let module imports settle

        # Re-load .env explicitly inside the WORKER process.
        # On Windows uvicorn --reload spawns workers fresh (no fork) so the
        # module-level load_dotenv only runs in the reloader process.
        # Reloading here guarantees the worker always sees the correct keys.
        try:
            from dotenv import load_dotenv as _re_dotenv
            for _ep in [Path(__file__).parent / ".env",
                        Path(__file__).parent.parent.parent / ".env"]:
                if _ep.exists():
                    # utf-8-sig strips BOM so first-line keys (GROQ_API_KEY) parse
                    _re_dotenv(dotenv_path=_ep, override=True, encoding='utf-8-sig')
                    logger.info(f"_warmup: env reloaded from {_ep}")
                    break
        except ImportError:
            pass

        groq_key = os.getenv("GROQ_API_KEY", "").strip()
        if not groq_key:
            logger.warning(
                "Pipeline warmup skipped — GROQ_API_KEY is MISSING. "
                "Set it as a HuggingFace Space Secret."
            )
            return
        logger.info("Warming up pipeline in online mode …")
        _pipeline = None   # reset so get_pipeline() re-evaluates
        _ = get_pipeline()
        logger.info("Pipeline warmed up in online mode.")
    except Exception as e:
        logger.warning(f"Warmup failed: {e}; will retry on first request.")
        _pipeline = None   # reset so first real request can retry



# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ACHP API",
    description=(
        "## Answer · Complete · Honest Probe\n\n"
        "7-agent Narrative Integrity pipeline.\n\n"
        "- **POST /kb/upload** — ingest PDF / DOCX / TXT / URL / raw text\n"
        "- **POST /analyze** — run full pipeline on a claim\n"
        "- **GET  /health**  — liveness probe\n"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ─────────────────────────────────────────────────────────────────────────────
# CORS — allow Next.js on any local port + production origin
# ─────────────────────────────────────────────────────────────────────────────

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    os.getenv("FRONTEND_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    # Vercel production + preview deployments of the web app (06 §2)
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX", r"https://achp(-[a-z0-9-]+)?\.vercel\.app"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Last-Event-ID"],
    expose_headers=["X-Run-Id", "X-Pipeline-Ms", "Location"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas (Pydantic v2)
# ─────────────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    project: str
    version: str
    timestamp: str
    pipeline_mode: str
    kb_count: int
    uptime_s: float = 0.0


class KBUploadResponse(BaseModel):
    kb_id: str
    name: str
    source_type: str
    chunk_count: int
    size_bytes: int
    status: str
    created_at: str
    message: str


class KBListItem(BaseModel):
    kb_id: str
    name: str
    source_type: str
    source_name: str
    doc_count: int
    chunk_count: int
    size_bytes: int
    status: str
    created_at: str
    tags: List[str]


class KBListResponse(BaseModel):
    total: int
    knowledge_bases: List[KBListItem]


class AnalyzeRequest(BaseModel):
    claim: str = Field(..., min_length=5, max_length=10_000,
                       description="The claim, question, or statement to analyze")
    kb_id: Optional[str] = Field(None, description="Knowledge-base ID to use (optional)")
    offline: Optional[bool] = Field(None, description="Force offline mode (no LLM API calls)")
    mode: Optional[str] = Field("analyze", description="'analyze' (fact-check) or 'qa' (grounded Q&A)")

    @field_validator("claim")
    @classmethod
    def strip_claim(cls, v: str) -> str:
        return v.strip()


class QARequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=5_000,
                          description="Question to answer from the knowledge base")
    kb_id: str    = Field(..., description="Knowledge-base ID to query")
    top_k: int    = Field(6, ge=1, le=20, description="Number of chunks to retrieve")


class QACitation(BaseModel):
    chunk_index: int
    excerpt:     str
    score:       float


class QAResponse(BaseModel):
    run_id:    str
    question:  str
    answer:    str          # grounded answer with [N] inline citations
    citations: List[QACitation]
    kb_id:     str
    kb_name:   str
    latency_ms: float


# ── Radar chart data — 5-axis (CTS, PCS, 1-BIS, NSS, EPS)

class RadarPoint(BaseModel):
    axis: str
    value: float
    description: str


class TransparencyReport(BaseModel):
    cts: float = Field(description="Consensus Truth Score (0–1)")
    pcs: float = Field(description="Perspective Completeness Score (0–1)")
    bis: float = Field(description="Bias Impact Score (0–1, lower=better)")
    nss: float = Field(description="Narrative Stance Score (0–1)")
    eps: float = Field(description="Epistemic Position Score (0–1)")
    composite_score: float
    radar_chart_data: List[RadarPoint]
    nil_verdict: str
    nil_confidence: float
    nil_summary: str
    nil_sub_agents: Dict[str, Any]
    pipeline_mode: str
    latency_ms: Dict[str, float]
    total_latency_ms: float
    models_used: Dict[str, str]
    cache_hit: bool
    debate_rounds: int
    security: Dict[str, Any]


class AnalyzeResponse(BaseModel):
    run_id: str
    timestamp: str
    claim: str
    verdict: str
    verdict_confidence: float
    verified_answer: str
    transparency_report: TransparencyReport
    alternative_perspectives: List[Dict[str, Any]]
    artifacts: Dict[str, Any]
    kb_used: Optional[str]


class RunInputBody(BaseModel):
    type: str = Field("text", pattern="^text$")
    text: str = Field(..., min_length=5, max_length=10_000)

    @field_validator("text")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return v.strip()


class RunOptions(BaseModel):
    fail_at: Optional[str] = Field(
        None, pattern="^(retriever|proposer|analysis|judge)$",
        description="Fixture recorder only: fail this stage on purpose (needs ACHP_ALLOW_FAULT_INJECTION=1)",
    )


class RunCreate(BaseModel):
    input: RunInputBody
    kb_id: Optional[str] = None
    options: Optional[RunOptions] = None


class RunCreated(BaseModel):
    run_id: str
    events_url: str
    case_url: str


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_radar(metrics: Dict[str, float]) -> List[RadarPoint]:
    CTS = metrics.get("CTS", 0.5)
    PCS = metrics.get("PCS", 0.5)
    BIS = metrics.get("BIS", 0.5)
    NSS = metrics.get("NSS", 0.5)
    EPS = metrics.get("EPS", 0.5)
    return [
        RadarPoint(axis="CTS", value=round(CTS, 3),
                   description="Consensus Truth Score — factual accuracy vs evidence"),
        RadarPoint(axis="PCS", value=round(PCS, 3),
                   description="Perspective Completeness — breadth of viewpoints covered"),
        RadarPoint(axis="Integrity", value=round(1.0 - BIS, 3),
                   description="Narrative Integrity (1 − BIS) — lower bias = higher score"),
        RadarPoint(axis="NSS", value=round(NSS, 3),
                   description="Narrative Stance Score — balanced framing"),
        RadarPoint(axis="EPS", value=round(EPS, 3),
                   description="Epistemic Position Score — appropriate certainty level"),
    ]


def _nil_to_sub_agents(output) -> Dict[str, Any]:
    """Extract nil sub-agent data from ACHPOutput.nil dict."""
    nil_data = output.nil if hasattr(output, "nil") else {}
    return {
        "BIS": nil_data.get("BIS", 0),
        "EPS": nil_data.get("EPS", 0),
        "PCS": nil_data.get("PCS", 0),
        "verdict": nil_data.get("verdict", "unknown"),
        "confidence": nil_data.get("confidence", 0),
        "summary": nil_data.get("summary", ""),
    }


def _build_verified_answer(output) -> str:
    """Build a human-readable verified answer from pipeline output."""
    verdict = getattr(output, "verdict", "UNKNOWN")
    confidence = getattr(output, "verdict_confidence", 0.0)
    reasoning  = getattr(output, "consensus_reasoning", "") or ""
    caveats    = getattr(output, "caveats", []) or []

    pct = f"{confidence * 100:.0f}%"
    lines = [f"**Verdict: {verdict}** (confidence: {pct})"]
    if reasoning:
        lines.append("")
        lines.append(reasoning[:800])
    if caveats:
        lines.append("")
        lines.append("**Important caveats:**")
        for c in caveats[:3]:
            lines.append(f"- {c}")
    return "\n".join(lines)


def _build_alternative_perspectives(output) -> List[Dict]:
    """Assemble missing / alternative perspectives from Adversary B output."""
    adv_b = getattr(output, "adversary_b", {}) or {}
    missing = adv_b.get("missing_perspectives", []) or []
    result = []
    for p in missing[:6]:
        if isinstance(p, dict):
            result.append({
                "stakeholder":  p.get("stakeholder", "Unknown"),
                "viewpoint":    p.get("viewpoint", ""),
                "significance": p.get("significance", 0.5),
            })
    return result


def _build_artifacts(output) -> Dict[str, Any]:
    """Structured export artifacts."""
    return {
        "atomic_claims":        getattr(output, "atomic_claims", []),
        "adversary_a":          getattr(output, "adversary_a", {}),
        "adversary_b":          getattr(output, "adversary_b", {}),
        "key_evidence":         getattr(output, "key_evidence", {}),
        "pipeline_metadata":    getattr(output, "pipeline", {}),
        "evidence":             getattr(output, "evidence", []),
        "claim_labels":         getattr(output, "claim_labels", []),
    }


def _pipeline_to_response(output, kb_used: Optional[str]) -> AnalyzeResponse:
    """Convert CorePipeline ACHPOutput → API AnalyzeResponse."""
    metrics  = getattr(output, "metrics", {}) or {}
    pipeline = getattr(output, "pipeline", {}) or {}
    nil_dict = getattr(output, "nil", {}) or {}

    radar = _build_radar(metrics)
    total_ms = pipeline.get("total_ms", 0.0)

    transparency = TransparencyReport(
        cts=metrics.get("CTS", 0.5),
        pcs=metrics.get("PCS", 0.5),
        bis=metrics.get("BIS", 0.5),
        nss=metrics.get("NSS", 0.5),
        eps=metrics.get("EPS", 0.5),
        composite_score=getattr(output, "composite_score", 0.5),
        radar_chart_data=radar,
        nil_verdict=nil_dict.get("verdict", "unknown"),
        nil_confidence=nil_dict.get("confidence", 0.0),
        nil_summary=nil_dict.get("summary", ""),
        nil_sub_agents=nil_dict,
        pipeline_mode=pipeline.get("mode", "full"),
        latency_ms=pipeline.get("latency_ms", {}),
        total_latency_ms=total_ms,
        models_used=pipeline.get("models", {}),
        cache_hit=pipeline.get("cache_hit", False),
        debate_rounds=getattr(output, "debate_rounds", 1),
        security=getattr(output, "security", {}),
    )

    return AnalyzeResponse(
        run_id=getattr(output, "run_id", uuid.uuid4().hex[:8]),
        timestamp=getattr(output, "timestamp", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        claim=getattr(output, "input", ""),
        verdict=getattr(output, "verdict", "UNKNOWN"),
        verdict_confidence=getattr(output, "verdict_confidence", 0.0),
        verified_answer=_build_verified_answer(output),
        transparency_report=transparency,
        alternative_perspectives=_build_alternative_perspectives(output),
        artifacts=_build_artifacts(output),
        kb_used=kb_used,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

# ── /health ──────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    tags=["System"],
)
async def health():
    has_keys = bool(os.getenv("GROQ_API_KEY"))
    mode     = "online" if has_keys else "offline (no API key)"
    kbs      = await kb_manager.list_kbs()
    return HealthResponse(
        status="ok",
        project="ACHP",
        version="1.0.0",
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        pipeline_mode=mode,
        kb_count=len(kbs),
        uptime_s=round(time.monotonic() - _STARTED, 1),
    )


@app.get("/health/llm", summary="Groq runtime telemetry and model registry", tags=["System"])
async def health_llm():
    """Model registry, per-model circuit state, queue depth and call telemetry (no prompts,
    no outputs, no keys)."""
    from achp.llm import registry
    from achp.llm.runtime import get_runtime
    from achp.memory.evidence_cache import get_evidence_cache
    return {
        "logical_agents": registry.logical_models(),
        "runtime": get_runtime().snapshot(),
        "evidence_cache": get_evidence_cache().stats(),
    }


# ── POST /kb/upload ───────────────────────────────────────────────────────────

@app.post(
    "/kb/upload",
    response_model=KBUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a knowledge base (file / URL / raw text)",
    tags=["Knowledge Base"],
)
async def kb_upload(
    # File upload (optional)
    file: Optional[UploadFile] = File(None, description="PDF, DOCX, or TXT file"),
    # URL ingestion (optional)
    url: Optional[str]  = Form(None, description="Public URL to fetch"),
    # Raw text (optional)
    text: Optional[str] = Form(None, description="Raw text content"),
    # Optional metadata
    name: Optional[str] = Form(None, description="Friendly KB name"),
    tags: Optional[str] = Form(None, description="Comma-separated tags"),
):
    """
    Ingest a knowledge base from **one** of:
    - `file` — multipart PDF / DOCX / TXT upload
    - `url`  — public URL (HTML page or PDF)
    - `text` — raw UTF-8 text in the form body

    Returns `kb_id` to reference in `/analyze`.
    """
    tag_list = [t.strip() for t in tags.split(",")] if tags else []

    if file is not None:
        allowed = {".pdf", ".docx", ".doc", ".txt", ".md"}
        ext = Path(file.filename or "upload.txt").suffix.lower()
        if ext not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Allowed: {sorted(allowed)}",
            )
        data = await file.read()
        if len(data) > 50 * 1024 * 1024:   # 50 MB limit
            raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
        rec = await kb_manager.ingest_file(file.filename or "upload.txt", data, tags=tag_list, name=name)

    elif url:
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
        from achp.kb.netguard import UnsafeURL, check_public_url
        try:
            await asyncio.to_thread(check_public_url, url)
        except UnsafeURL as e:
            raise HTTPException(status_code=400, detail=str(e))
        rec = await kb_manager.ingest_url(url, tags=tag_list, name=name)

    elif text:
        if len(text) < 10:
            raise HTTPException(status_code=400, detail="Text too short (min 10 chars)")
        rec = await kb_manager.ingest_text(text, name=name or "raw_text", tags=tag_list)

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide one of: 'file' (multipart), 'url' (form field), or 'text' (form field)",
        )

    return KBUploadResponse(
        kb_id=rec.kb_id,
        name=rec.name,
        source_type=rec.source_type,
        chunk_count=rec.chunk_count,
        size_bytes=rec.size_bytes,
        status=rec.status,
        created_at=rec.created_at,
        message=f"Knowledge base '{rec.name}' ingested successfully ({rec.chunk_count} chunks).",
    )


# ── GET /kb/list ──────────────────────────────────────────────────────────────

@app.get(
    "/kb/list",
    response_model=KBListResponse,
    summary="List all knowledge bases",
    tags=["Knowledge Base"],
)
async def kb_list():
    """Return all ingested knowledge bases with metadata."""
    kbs = await kb_manager.list_kbs()
    items = []
    for k in kbs:
        items.append(KBListItem(
            kb_id=k["kb_id"],
            name=k["name"],
            source_type=k["source_type"],
            source_name=k["source_name"],
            doc_count=k["doc_count"],
            chunk_count=k["chunk_count"],
            size_bytes=k["size_bytes"],
            status=k["status"],
            created_at=k["created_at"],
            tags=k.get("tags", []),
        ))
    return KBListResponse(total=len(items), knowledge_bases=items)


# ── DELETE /kb/{kb_id} ────────────────────────────────────────────────────────

class KBDeleteResponse(BaseModel):
    kb_id: str
    deleted: bool
    message: str


@app.delete(
    "/kb/{kb_id}",
    response_model=KBDeleteResponse,
    summary="Delete a knowledge base by ID",
    tags=["Knowledge Base"],
)
async def kb_delete(kb_id: str):
    """
    Permanently delete a knowledge base and all its documents.
    Returns `deleted: true` on success, 404 if not found.
    """
    kb_meta = await kb_manager.get_kb(kb_id)
    if not kb_meta:
        raise HTTPException(
            status_code=404,
            detail=f"Knowledge base '{kb_id}' not found.",
        )
    deleted = await kb_manager.delete_kb(kb_id)
    return KBDeleteResponse(
        kb_id=kb_id,
        deleted=deleted,
        message=f"Knowledge base '{kb_meta['name']}' deleted successfully." if deleted else "Delete failed.",
    )


# ── GET /kb/{kb_id}/chunks ────────────────────────────────────────────────────

class KBChunk(BaseModel):
    index: int
    text: str
    char_count: int

class KBChunksResponse(BaseModel):
    kb_id: str
    name: str
    chunk_count: int
    chunks: List[KBChunk]

@app.get(
    "/kb/{kb_id}/chunks",
    response_model=KBChunksResponse,
    summary="Get all raw text chunks stored in a knowledge base",
    tags=["Knowledge Base"],
)
async def kb_get_chunks(kb_id: str):
    """
    Return every raw text chunk stored for the given knowledge base.
    Useful for verifying what was ingested and how text was split.
    """
    kb_meta = await kb_manager.get_kb(kb_id)
    if not kb_meta:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{kb_id}' not found.")
    raw_chunks = await kb_manager.get_chunks(kb_id)   # list of {chunk_index, text, score}
    chunks = [
        KBChunk(index=c["chunk_index"], text=c["text"], char_count=len(c["text"]))
        for c in raw_chunks
    ]
    return KBChunksResponse(
        kb_id=kb_id,
        name=kb_meta.get("name", kb_id),
        chunk_count=len(chunks),
        chunks=chunks,
    )


# ── Runs (event protocol v2, 06_AGENT_STATE_SPEC) ─────────────────────────────

SSE_PING_S = float(os.getenv("ACHP_SSE_PING_S", 15))
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
# A comment keeps proxies open; the named `ping` event (no id, so Last-Event-ID is untouched) reaches
# EventSource listeners, which never see comments, so the client watchdog can reset on it (06 §3.3).
SSE_PING = ": ping\nevent: ping\ndata: {}\n\n"


def _iso(ts: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


async def _resolve_kb(kb_id: Optional[str]) -> str:
    """The library's name; 404 / 409 before a run is created, so a bad id never starts one."""
    if not kb_id:
        return ""
    kb_meta = await kb_manager.get_kb(kb_id)
    if not kb_meta:
        raise HTTPException(
            status_code=404,
            detail=f"Knowledge base '{kb_id}' not found. Use /kb/list to see available KBs.",
        )
    if kb_meta["status"] != "ready":
        raise HTTPException(
            status_code=409,
            detail=f"Knowledge base '{kb_id}' is not ready (status: {kb_meta['status']}).",
        )
    return kb_meta.get("name", kb_id)


async def _execute_run(run_id: str, text: str, kb_id: Optional[str], kb_name: str,
                       fail_at: Optional[str] = None) -> None:
    """The background body of a run: pipeline → stored result → run.completed, or run.failed.
    Every event goes through RunEventBus.emit; nothing here invents a result."""
    from achp.core.core_pipeline import PipelineError
    from achp.events import RunEvents, get_bus, notes

    bus = get_bus()
    ev = RunEvents(bus, run_id)
    t0 = time.perf_counter()

    kb_search = None
    if kb_id:
        async def kb_search() -> List[Dict]:
            chunks = await kb_manager.search(kb_id, text, top_k=6)
            logger.info(f"[{run_id}] KB '{kb_id}' context: {len(chunks)} chunks")
            return chunks[:5]

    async def fail(stage: str, code: str, message: str, retryable: bool) -> None:
        bus.store.set_status(run_id, "failed", error={"stage": stage, "error_code": code,
                                                      "message": message, "retryable": retryable})
        await ev.fail(stage, code, message, retryable)

    try:
        output = await get_pipeline().run(
            text, ev, kb_search=kb_search, kb_id=kb_id, kb_name=kb_name or None,
            run_id=run_id, fail_at=fail_at,
        )
    except PipelineError as e:
        logger.error(f"[{run_id}] Pipeline stage failed: {e}")
        await fail(e.stage, e.code, notes.failure_message(e.stage, e.code), e.retryable)
        return
    except Exception as e:
        logger.exception(f"[{run_id}] Pipeline error: {e}")
        await fail("internal", "internal_error", notes.failure_message("internal", "internal_error"), True)
        return

    try:
        response = _pipeline_to_response(output, kb_used=kb_id)
        response.run_id = run_id
        result = response.model_dump()
    except Exception as e:
        logger.exception(f"[{run_id}] Could not build the result: {e}")
        await fail("internal", "internal_error", notes.failure_message("internal", "internal_error"), True)
        return
    # The result is stored first; then verdict.final and run.completed go out together.
    bus.store.set_status(run_id, "completed", result=result)
    try:
        await ev.complete(int((time.perf_counter() - t0) * 1000),
                          bool((output.pipeline or {}).get("cache_hit", False)))
    except Exception as e:
        logger.exception(f"[{run_id}] Could not close the log: {e}")
        await bus._fail(run_id, "internal", "internal_error", notes.failure_message("internal", "internal_error"), True)


def _start_run(text: str, kb_id: Optional[str], kb_name: str, *, run_id: Optional[str] = None,
               fail_at: Optional[str] = None):
    from achp.events import get_bus
    bus = get_bus()
    rid = bus.create_run({"type": "text", "text": text, **({"kb_id": kb_id} if kb_id else {})}, run_id=run_id)
    task = bus.start(rid, lambda: _execute_run(rid, text, kb_id, kb_name, fail_at))
    return rid, task


@app.post(
    "/runs",
    status_code=202,
    response_model=RunCreated,
    summary="Start a run; progress streams from /runs/{id}/events",
    tags=["Runs"],
)
async def create_run(body: RunCreate):
    fail_at = body.options.fail_at if body.options else None
    if fail_at and os.getenv("ACHP_ALLOW_FAULT_INJECTION", "").strip() != "1":
        raise HTTPException(status_code=400, detail="options.fail_at is only accepted by a recorder backend.")
    kb_name = await _resolve_kb(body.kb_id)
    run_id, _task = _start_run(body.input.text, body.kb_id, kb_name, fail_at=fail_at)
    return JSONResponse(
        status_code=202,
        content=RunCreated(run_id=run_id, events_url=f"/runs/{run_id}/events",
                           case_url=f"/case/{run_id}").model_dump(),
        headers={"X-Run-Id": run_id, "Location": f"/runs/{run_id}"},
    )


def _after_seq(request: Request, since: Optional[int]) -> int:
    """The later of `?since=` and `Last-Event-ID` (a native reconnect to a ?since URL sends both)."""
    raw = (request.headers.get("last-event-id") or "").strip()
    return max(since or 0, int(raw) if raw.isdigit() else 0)


@app.get("/runs/{run_id}/events", summary="The run's event log as SSE (resumable)", tags=["Runs"])
async def run_events(run_id: str, request: Request, since: Optional[int] = Query(None, ge=0)):
    """Replays the backlog after `Last-Event-ID` (or `?since=`), then streams live events.
    `id:` is the seq; a `: ping` comment every 15s; closes after run.completed / run.failed."""
    from achp.events import get_bus
    bus = get_bus()
    if bus.get_run(run_id) is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    after = _after_seq(request, since)

    async def stream() -> AsyncGenerator[str, None]:
        async for event in bus.subscribe(run_id, after, ping_s=SSE_PING_S):
            if await request.is_disconnected():
                break
            yield SSE_PING if event is None else event.sse()

    return StreamingResponse(stream(), media_type="text/event-stream; charset=utf-8", headers=SSE_HEADERS)


@app.get("/runs/{run_id}", summary="Run snapshot (SSR and polling fallback)", tags=["Runs"])
async def run_snapshot(run_id: str):
    from achp.events import get_bus
    record = get_bus().get_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    body: Dict[str, Any] = {
        "run_id": record.run_id, "status": record.status, "created_at": _iso(record.created_at),
        "input": record.input, "last_seq": record.last_seq,
    }
    if record.result is not None:
        body["result"] = record.result
    if record.error is not None:
        body["error"] = record.error
    return body


@app.get("/runs/{run_id}/events.json", summary="The full event log (Trace export, replay, gap repair)",
         tags=["Runs"])
async def run_events_json(run_id: str, since: int = Query(0, ge=0)):
    from achp.events import RunNotFound, get_bus
    try:
        events = get_bus().events(run_id, since)
    except RunNotFound:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    return {"run_id": run_id, "events": [e.model_dump() for e in events]}


# ── POST /analyze (compatibility wrapper) ─────────────────────────────────────

@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyze a claim through the full 7-agent pipeline",
    tags=["Analysis"],
)
async def analyze(
    request: AnalyzeRequest,
    req: Request,
):
    """
    Compatibility wrapper over `/runs`: creates a run, waits for it, and returns the same response
    shape as before. The run's event log is available at `/runs/{run_id}/events.json`.

    1. **SecurityValidator** — input safety check
    2. **Retriever** — fetch evidence (KB or web)
    3. **Proposer** — decompose into atomic claims
    4. **AdversaryA** — factual challenge (parallel)
    5. **AdversaryB** — narrative audit (parallel)
    6. **NIL** — 5-sub-agent narrative integrity layer (parallel)
    7. **Judge** — synthesise verdict
    8. **SecurityValidator** — output safety check
    """
    t_api = time.perf_counter()

    # `offline: true` used to return a mock verdict. A verdict without a real run is never
    # returned now; demo data lives only in the web app's ?demo=1 mode.
    if request.offline:
        raise HTTPException(
            status_code=400,
            detail="Offline mode was removed: ACHP never returns a verdict without a real run. "
                   "Use the web app's demo mode (?demo=1) for sample data.",
        )
    kb_name = await _resolve_kb(request.kb_id)

    from achp.events import get_bus
    run_id, task = _start_run(request.claim, request.kb_id, kb_name, run_id=req.headers.get("x-run-id"))
    # Shielded: a client that disconnects doesn't cancel the run; its log stays complete.
    await asyncio.shield(task)

    record = get_bus().get_run(run_id)
    total_api_ms = (time.perf_counter() - t_api) * 1000
    if record is not None and record.status == "completed" and record.result is not None:
        return JSONResponse(
            content=record.result,
            headers={"X-Run-Id": run_id, "X-Pipeline-Ms": f"{total_api_ms:.0f}"},
        )
    err = (record.error if record else None) or {}
    if err.get("error_code") == "internal_error":
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed (run {run_id}).")
    return JSONResponse(
        status_code=503,
        content={
            "detail": err.get("message") or "The run couldn't finish, so no verdict was produced.",
            "stage": err.get("stage", "unknown"),
            "error_code": err.get("error_code", "unknown"),
            "retryable": bool(err.get("retryable", True)),
            "run_id": run_id,
        },
        headers={"X-Run-Id": run_id},
    )


@app.get(
    "/analyze/{run_id}/stream",
    summary="Alias of /runs/{run_id}/events (event protocol v2)",
    tags=["Analysis"],
)
async def analyze_stream(run_id: str, request: Request, since: Optional[int] = Query(None, ge=0)):
    return await run_events(run_id, request, since)


# ── POST /qa — NotebookLM-style grounded Q&A ─────────────────────────────────


@app.post(
    "/qa",
    response_model=QAResponse,
    summary="Grounded Q&A from a knowledge base (hallucination-free RAG)",
    tags=["Analysis"],
)
async def kb_qa(request: QARequest):
    """
    Ask any question against a knowledge base.

    - Retrieves the most relevant chunks (FAISS similarity search)
    - Generates a grounded answer that **only** uses retrieved content
    - Returns inline citations `[N]` mapping to the exact chunk index & text

    Designed to be hallucination-free: the LLM is instructed never to use
    outside knowledge — only the provided KB chunks.
    """
    t0 = time.perf_counter()
    run_id = uuid.uuid4().hex[:8]

    # ── 0. Screen the question like a claim: an instruction or a query is not a question about the library ──
    from achp.agents.security_validator import SecurityValidatorAgent
    screen = SecurityValidatorAgent().validate_input(request.question)
    if not screen.safe:
        raise HTTPException(
            status_code=400,
            detail=f"This question was not sent ({(screen.block_reason or 'unsafe input').lower()}). "
                   "Ask about what the library says.",
        )

    # ── 1. Validate KB ────────────────────────────────────────────────────────
    kb_meta = await kb_manager.get_kb(request.kb_id)
    if not kb_meta:
        raise HTTPException(status_code=404,
                            detail=f"Knowledge base '{request.kb_id}' not found.")
    if kb_meta["status"] != "ready":
        raise HTTPException(status_code=409,
                            detail=f"KB not ready (status: {kb_meta['status']}).")
    kb_name = kb_meta.get("name", request.kb_id)

    # ── 2. Retrieve top-K chunks (triple-layer fallback) ──────────────────────
    # Layer 1: FAISS semantic search (best quality)
    chunks = await kb_manager.search(request.kb_id, request.question, top_k=request.top_k)

    # Layer 2: If FAISS & lexical both fail (e.g. encoder unavailable), load all
    # raw chunks from SQLite — guarantees LLM always receives KB context.
    if not chunks:
        logger.warning(f"[{run_id}] Search returned 0 chunks for KB '{request.kb_id}'. "
                       "Falling back to raw SQLite chunk dump.")
        chunks = await kb_manager.get_chunks(request.kb_id)

    # Layer 3: If KB truly has no content at all, tell the user cleanly.
    if not chunks:
        return QAResponse(
            run_id=run_id, question=request.question,
            answer="This knowledge base appears to be empty. Please re-ingest your content.",
            citations=[], kb_id=request.kb_id, kb_name=kb_name,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    # ── 3. Build context string with [CHUNK N] markers ────────────────────────
    context_blocks = []
    for ch in chunks:
        context_blocks.append(
            f"[CHUNK {ch['chunk_index']}]\n{ch['text'][:1200]}"
        )
    context_str = "\n\n".join(context_blocks)

    # ── 4. Grounded answer through the shared Groq runtime ────────────────────
    # The model returns sentences with the CHUNK numbers they come from. Server-side, a sentence
    # survives only if it cites at least one chunk that was actually retrieved; the answer text
    # is assembled here with [N] markers, so a citation can't point at a chunk the user can't see.
    from achp.llm.runtime import LLMUnavailable, get_runtime
    from achp.prompts.contract import build_messages
    from achp.prompts.schemas import QAOutput

    retrieved = {ch["chunk_index"] for ch in chunks}
    answer_text = ""
    try:
        result = await get_runtime().complete(
            "qa",
            build_messages("qa", {
                "QUESTION": request.question,
                "LIBRARY": kb_name,
                "CHUNKS": [{"chunk": ch["chunk_index"], "text": ch["text"][:1200]} for ch in chunks],
            }),
            QAOutput,
            run_id=run_id,
        )
        qa = result.value
        sentences = []
        for s in qa.sentences:
            ids = [i for i in dict.fromkeys(s.chunk_ids) if i in retrieved]
            if ids and s.text.strip():
                sentences.append(s.text.strip() + " " + "".join(f"[{i}]" for i in ids))
        if qa.found and sentences:
            answer_text = " ".join(sentences)
        else:
            answer_text = "The knowledge base does not contain information about this."
    except LLMUnavailable as e:
        logger.warning(f"[{run_id}] /qa model unavailable: {e}")

    # Without a model, don't write an answer: show the closest passages, labelled as such.
    if not answer_text:
        passages = " ".join(f"{ch['text'][:300].rstrip()} [{ch['chunk_index']}]" for ch in chunks[:3])
        answer_text = ("The answer service is unavailable right now. Closest passages from your "
                       f"library: {passages}") if passages else "No answer could be generated."

    # ── 5. Build citations: always include ALL retrieved chunks ──────────────────
    import re as _re
    # Parse which chunks the LLM explicitly cited (handles [CHUNK 3] and [3])
    cited_indices = set(
        int(m)
        for m in _re.findall(r'\[(?:CHUNK\s*)?(\d+)\]', answer_text, _re.IGNORECASE)
    )

    citations = []
    # Always return ALL retrieved chunks so the user can see what was used,
    # regardless of whether the LLM's inline markers matched exactly.
    for ch in chunks:
        citations.append(QACitation(
            chunk_index=ch["chunk_index"],
            excerpt=ch["text"][:350],
            score=round(ch.get("score", 0.0), 4),
        ))
    # Sort: cited-first, then by score descending
    def _sort_key(c: QACitation):
        return (0 if c.chunk_index in cited_indices else 1, -c.score)
    citations.sort(key=_sort_key)

    return QAResponse(
        run_id=run_id,
        question=request.question,
        answer=answer_text,
        citations=citations,
        kb_id=request.kb_id,
        kb_name=kb_name,
        latency_ms=round((time.perf_counter() - t0) * 1000, 2),
    )


# ── GET /kb/{kb_id} — individual KB detail ────────────────────────────────────

@app.get(
    "/kb/{kb_id}",
    response_model=KBListItem,
    summary="Get knowledge base details",
    tags=["Knowledge Base"],
)
async def kb_detail(kb_id: str):
    kb = await kb_manager.get_kb(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail=f"KB '{kb_id}' not found")
    return KBListItem(**{k: v for k, v in kb.items() if k in KBListItem.model_fields})


# ─────────────────────────────────────────────────────────────────────────────
# Global exception handler
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)[:200]}"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dev runner
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level=os.getenv("ACHP_LOG_LEVEL", "info").lower(),
    )

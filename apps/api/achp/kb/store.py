"""
ACHP — Knowledge Base Store (kb/store.py)
==========================================
Provides SQLite-backed metadata storage + FAISS vector index for uploaded knowledge bases.

Supports:
  - PDF, DOCX, TXT file ingestion
  - URL fetching + raw text
  - FAISS L2 vector index per KB
  - SQLite for KB metadata + document records
  - Async-friendly wrappers
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────

DATA_DIR   = Path(os.getenv("ACHP_DATA_DIR", Path(__file__).parent.parent.parent / "data" / "kb"))
DB_PATH    = DATA_DIR / "kb_metadata.db"
FAISS_DIR  = DATA_DIR / "faiss"

DATA_DIR.mkdir(parents=True, exist_ok=True)
FAISS_DIR.mkdir(parents=True, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class KBRecord:
    kb_id:       str
    name:        str
    source_type: str          # "file" | "url" | "text"
    source_name: str          # filename / url / "raw_text"
    doc_count:   int
    chunk_count: int
    created_at:  str
    size_bytes:  int
    status:      str          # "ready" | "processing" | "error"
    error_msg:   Optional[str] = None
    tags:        List[str]    = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# SQLite helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                kb_id       TEXT PRIMARY KEY,
                name        TEXT,
                source_type TEXT,
                source_name TEXT,
                doc_count   INTEGER DEFAULT 0,
                chunk_count INTEGER DEFAULT 0,
                created_at  TEXT,
                size_bytes  INTEGER DEFAULT 0,
                status      TEXT DEFAULT 'processing',
                error_msg   TEXT,
                tags        TEXT DEFAULT '[]'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS kb_documents (
                doc_id     TEXT PRIMARY KEY,
                kb_id      TEXT,
                content    TEXT,
                metadata   TEXT,
                FOREIGN KEY(kb_id) REFERENCES knowledge_bases(kb_id)
            )
        """)
        conn.commit()


_init_db()


def _save_kb(rec: KBRecord):
    with _get_conn() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO knowledge_bases
            (kb_id, name, source_type, source_name, doc_count, chunk_count,
             created_at, size_bytes, status, error_msg, tags)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (
            rec.kb_id, rec.name, rec.source_type, rec.source_name,
            rec.doc_count, rec.chunk_count, rec.created_at, rec.size_bytes,
            rec.status, rec.error_msg, json.dumps(rec.tags),
        ))
        conn.commit()


def _update_kb_status(kb_id: str, status: str, doc_count: int = 0,
                      chunk_count: int = 0, error_msg: Optional[str] = None):
    with _get_conn() as conn:
        conn.execute("""
            UPDATE knowledge_bases
            SET status=?, doc_count=?, chunk_count=?, error_msg=?
            WHERE kb_id=?
        """, (status, doc_count, chunk_count, error_msg, kb_id))
        conn.commit()


def _list_kbs() -> List[Dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM knowledge_bases ORDER BY created_at DESC"
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags", "[]"))
        result.append(d)
    return result


def _get_kb(kb_id: str) -> Optional[Dict]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM knowledge_bases WHERE kb_id=?", (kb_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["tags"] = json.loads(d.get("tags", "[]"))
    return d


def _save_chunks(kb_id: str, chunks: List[Dict]):
    with _get_conn() as conn:
        for c in chunks:
            conn.execute("""
                INSERT OR IGNORE INTO kb_documents (doc_id, kb_id, content, metadata)
                VALUES (?,?,?,?)
            """, (c["doc_id"], kb_id, c["content"], json.dumps(c.get("metadata", {}))))
        conn.commit()


def _get_chunks(kb_id: str) -> List[Dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM kb_documents WHERE kb_id=?", (kb_id,)
        ).fetchall()
    return [{"doc_id": r["doc_id"], "content": r["content"],
             "metadata": json.loads(r["metadata"])} for r in rows]


def _delete_kb(kb_id: str) -> bool:
    """Remove KB record + documents from SQLite and FAISS files."""
    with _get_conn() as conn:
        conn.execute("DELETE FROM kb_documents WHERE kb_id=?", (kb_id,))
        rows_deleted = conn.execute(
            "DELETE FROM knowledge_bases WHERE kb_id=?", (kb_id,)
        ).rowcount
        conn.commit()
    # Also remove FAISS index files if they exist
    for p in [_faiss_index_path(kb_id), _faiss_meta_path(kb_id)]:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass
    return rows_deleted > 0


# ─────────────────────────────────────────────────────────────────────────────
# Text Extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_pdf(data: bytes) -> str:
    try:
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except ImportError:
        try:
            import io
            import pdfminer.high_level as phl
            return phl.extract_text(io.BytesIO(data))
        except ImportError:
            logger.warning("No PDF library available (pypdf/pdfminer). Returning raw bytes as text.")
            return data.decode("utf-8", errors="replace")


def _extract_docx(data: bytes) -> str:
    try:
        import io
        import docx
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError:
        logger.warning("python-docx not installed. Returning raw bytes as text.")
        return data.decode("utf-8", errors="replace")


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> List[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return [c for c in chunks if c.strip()]


# ─────────────────────────────────────────────────────────────────────────────
# FAISS Vector Store
# ─────────────────────────────────────────────────────────────────────────────

_encoder = None

def _get_encoder():
    global _encoder
    if _encoder is None:
        try:
            from sentence_transformers import SentenceTransformer
            _encoder = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Encoder loaded: all-MiniLM-L6-v2")
        except Exception as e:
            logger.warning(f"SentenceTransformer unavailable: {e}. KB search will be lexical-only.")
    return _encoder


def _faiss_index_path(kb_id: str) -> Path:
    return FAISS_DIR / f"{kb_id}.faiss"


def _faiss_meta_path(kb_id: str) -> Path:
    return FAISS_DIR / f"{kb_id}_meta.json"


def _build_faiss_index(kb_id: str, texts: List[str]) -> bool:
    """Build and save FAISS index for a KB. Returns True on success."""
    enc = _get_encoder()
    if enc is None:
        return False
    try:
        import faiss
        import numpy as np
        embeddings = enc.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        embeddings = np.array(embeddings, dtype=np.float32)
        dim = embeddings.shape[1]
        index = faiss.IndexFlatIP(dim)   # Inner product (cosine on normalized)
        index.add(embeddings)
        faiss.write_index(index, str(_faiss_index_path(kb_id)))
        # Save chunk texts for retrieval
        with open(_faiss_meta_path(kb_id), "w") as f:
            json.dump(texts, f)
        logger.info(f"FAISS index built: {kb_id} ({len(texts)} chunks, dim={dim})")
        return True
    except Exception as e:
        logger.warning(f"FAISS index build failed for {kb_id}: {e}")
        return False


def _search_faiss(kb_id: str, query: str, top_k: int = 5) -> List[Dict]:
    """Search KB vector index. Returns list of {chunk_index, text, score}."""
    idx_path  = _faiss_index_path(kb_id)
    meta_path = _faiss_meta_path(kb_id)
    if not idx_path.exists() or not meta_path.exists():
        return _lexical_search(kb_id, query, top_k)
    enc = _get_encoder()
    if enc is None:
        return _lexical_search(kb_id, query, top_k)
    try:
        import faiss
        import numpy as np
        index  = faiss.read_index(str(idx_path))
        with open(meta_path) as f:
            texts = json.load(f)
        q_emb  = enc.encode([query], normalize_embeddings=True)
        q_emb  = np.array(q_emb, dtype=np.float32)
        D, I   = index.search(q_emb, top_k)
        return [
            {"chunk_index": int(i), "text": texts[i], "score": float(D[0][rank])}
            for rank, i in enumerate(I[0]) if 0 <= i < len(texts)
        ]
    except Exception as e:
        logger.warning(f"FAISS search failed for {kb_id}: {e}")
        return _lexical_search(kb_id, query, top_k)


def _lexical_search(kb_id: str, query: str, top_k: int = 5) -> List[Dict]:
    """Keyword scoring fallback. Returns list of {chunk_index, text, score}.
    Always returns up to top_k results even with score=0 (ensures the LLM
    always receives context when FAISS is unavailable)."""
    chunks  = _get_chunks(kb_id)
    q_words = set(query.lower().split())
    scored  = []
    for idx, c in enumerate(chunks):
        text  = c["content"]
        score = sum(1 for w in q_words if w in text.lower())
        scored.append((score, idx, text))
    scored.sort(key=lambda x: -x[0])
    # Return top_k regardless of score so the LLM always has context
    return [
        {"chunk_index": idx, "text": text, "score": float(score) / max(1, len(q_words))}
        for score, idx, text in scored[:top_k]
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Public KB Manager
# ─────────────────────────────────────────────────────────────────────────────

class KBManager:
    """
    Thread-safe (via asyncio executor) knowledge base manager.
    All public methods are async.
    """

    async def ingest_file(
        self,
        filename: str,
        data: bytes,
        tags: Optional[List[str]] = None,
    ) -> KBRecord:
        """Ingest an uploaded file (PDF / DOCX / TXT)."""
        kb_id = uuid.uuid4().hex[:12]
        ext   = Path(filename).suffix.lower()
        rec   = KBRecord(
            kb_id=kb_id,
            name=filename,
            source_type="file",
            source_name=filename,
            doc_count=0,
            chunk_count=0,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            size_bytes=len(data),
            status="processing",
            tags=tags or [],
        )
        _save_kb(rec)

        loop   = asyncio.get_event_loop()
        rec    = await loop.run_in_executor(
            None, self._process_file, kb_id, filename, data, ext, rec
        )
        return rec

    def _process_file(self, kb_id, filename, data, ext, rec: KBRecord) -> KBRecord:
        try:
            if ext == ".pdf":
                text = _extract_pdf(data)
            elif ext in (".docx", ".doc"):
                text = _extract_docx(data)
            else:   # .txt, .md, anything else
                text = data.decode("utf-8", errors="replace")

            chunks = _chunk_text(text)
            chunk_records = [
                {"doc_id": f"{kb_id}_{i}", "content": c, "metadata": {"source": filename, "chunk": i}}
                for i, c in enumerate(chunks)
            ]
            _save_chunks(kb_id, chunk_records)
            _build_faiss_index(kb_id, [c["content"] for c in chunk_records])
            _update_kb_status(kb_id, "ready", doc_count=1, chunk_count=len(chunks))
            rec.status      = "ready"
            rec.doc_count   = 1
            rec.chunk_count = len(chunks)
        except Exception as e:
            logger.error(f"KB ingest error {kb_id}: {e}")
            _update_kb_status(kb_id, "error", error_msg=str(e))
            rec.status    = "error"
            rec.error_msg = str(e)
        return rec

    async def ingest_url(self, url: str, tags: Optional[List[str]] = None) -> KBRecord:
        """Fetch URL and ingest as KB."""
        kb_id = uuid.uuid4().hex[:12]
        rec   = KBRecord(
            kb_id=kb_id, name=url, source_type="url", source_name=url,
            doc_count=0, chunk_count=0,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            size_bytes=0, status="processing", tags=tags or [],
        )
        _save_kb(rec)
        try:
            text = await self._fetch_url_text(url)
            if len(text.strip()) < 50:
                raise ValueError(
                    f"Fetched content too short ({len(text)} chars). "
                    "The URL may require authentication or block bots."
                )
            rec.size_bytes = len(text.encode())
            loop = asyncio.get_event_loop()
            rec  = await loop.run_in_executor(
                None, self._process_text_kb, kb_id, url, text, rec
            )
        except Exception as e:
            logger.error(f"KB URL ingest error {kb_id}: {e}")
            _update_kb_status(kb_id, "error", error_msg=str(e))
            rec.status    = "error"
            rec.error_msg = str(e)
        return rec

    async def _fetch_url_text(self, url: str) -> str:
        """Smart URL fetcher: uses Wikipedia REST API for wikipedia.org, httpx for everything else."""
        import httpx
        import re

        # ── Wikipedia: use their public REST API to avoid 403 ──
        wiki_match = re.match(
            r'https?://(?P<lang>[a-z]{2,})\.wikipedia\.org/wiki/(?P<title>.+)', url
        )
        if wiki_match:
            lang  = wiki_match.group("lang")
            title = wiki_match.group("title")
            api_url = (
                f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
            )
            # Also try the full extract
            extract_url = (
                f"https://{lang}.wikipedia.org/w/api.php"
                f"?action=query&prop=extracts&exlimitreq=max&exintro=0"
                f"&titles={title}&format=json&redirects=1"
            )
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                # Get summary first
                try:
                    r = await client.get(api_url)
                    if r.status_code == 200:
                        data = r.json()
                        summary = data.get("extract", "")
                    else:
                        summary = ""
                except Exception:
                    summary = ""

                # Get full extract
                try:
                    r = await client.get(extract_url)
                    if r.status_code == 200:
                        data = r.json()
                        pages = data.get("query", {}).get("pages", {})
                        full  = " ".join(
                            p.get("extract", "") for p in pages.values()
                        )
                        # Strip HTML from extract
                        full = self._html_to_text(full)
                    else:
                        full = ""
                except Exception:
                    full = ""

            combined = (summary + " " + full).strip()
            if combined:
                return combined
            raise ValueError("Wikipedia REST API returned empty content.")

        # ── Generic URL: browser-like headers ──
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=45, headers=headers,
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 403:
                raise ValueError(
                    f"Access denied (403) for URL: {url}. "
                    "The site blocks automated access. Try pasting the text content directly instead."
                )
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "pdf" in content_type:
                return _extract_pdf(resp.content)
            return self._html_to_text(resp.text)




    async def ingest_text(
        self, text: str, name: str = "raw_text", tags: Optional[List[str]] = None
    ) -> KBRecord:
        """Ingest raw text directly."""
        kb_id = uuid.uuid4().hex[:12]
        rec   = KBRecord(
            kb_id=kb_id, name=name, source_type="text", source_name="raw_text",
            doc_count=1, chunk_count=0,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            size_bytes=len(text.encode()), status="processing", tags=tags or [],
        )
        _save_kb(rec)
        loop = asyncio.get_event_loop()
        rec  = await loop.run_in_executor(
            None, self._process_text_kb, kb_id, name, text, rec
        )
        return rec

    def _process_text_kb(self, kb_id, name, text, rec: KBRecord) -> KBRecord:
        try:
            chunks = _chunk_text(text)
            chunk_records = [
                {"doc_id": f"{kb_id}_{i}", "content": c,
                 "metadata": {"source": name, "chunk": i}}
                for i, c in enumerate(chunks)
            ]
            _save_chunks(kb_id, chunk_records)
            _build_faiss_index(kb_id, [c["content"] for c in chunk_records])
            _update_kb_status(kb_id, "ready", doc_count=1, chunk_count=len(chunks))
            rec.status      = "ready"
            rec.chunk_count = len(chunks)
        except Exception as e:
            logger.error(f"KB text ingest error {kb_id}: {e}")
            _update_kb_status(kb_id, "error", error_msg=str(e))
            rec.status    = "error"
            rec.error_msg = str(e)
        return rec

    @staticmethod
    def _html_to_text(html: str) -> str:
        """Minimal HTML → plain text (no extra deps)."""
        import re
        text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<style[^>]*>.*?</style>",  " ", text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"&nbsp;", " ", text)
        text = re.sub(r"&amp;",  "&", text)
        text = re.sub(r"&lt;",   "<", text)
        text = re.sub(r"&gt;",   ">", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    async def list_kbs(self) -> List[Dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _list_kbs)

    async def get_kb(self, kb_id: str) -> Optional[Dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _get_kb, kb_id)

    async def search(self, kb_id: str, query: str, top_k: int = 5) -> List[Dict]:
        """Search KB. Returns list of {chunk_index, text, score} dicts."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _search_faiss, kb_id, query, top_k)

    async def get_chunks(self, kb_id: str) -> List[Dict]:
        """Return ALL raw chunks from SQLite for a KB (last-resort fallback).
        Returns list of {chunk_index, text, score} with score=0.5."""
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, _get_chunks, kb_id)
        return [
            {"chunk_index": i, "text": c["content"], "score": 0.5}
            for i, c in enumerate(raw)
        ]

    async def delete_kb(self, kb_id: str) -> bool:
        """Delete a KB and all its data. Returns True if found+deleted."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _delete_kb, kb_id)


# Module-level singleton
kb_manager = KBManager()

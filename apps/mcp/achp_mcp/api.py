"""A small async client for ACHP's public REST API (the same calls /developers documents)."""
from __future__ import annotations

from typing import Any

import httpx


class AchpApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


class AchpApi:
    def __init__(self, base_url: str, *, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self.base_url, transport=transport, timeout=timeout, headers={"user-agent": "achp-mcp/1"}
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _json(self, method: str, path: str, **kw: Any) -> Any:
        try:
            r = await self._client.request(method, path, **kw)
        except httpx.HTTPError as e:
            raise AchpApiError(0, f"ACHP could not be reached at {self.base_url}: {type(e).__name__}.") from e
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail")
            except Exception:
                detail = None
            raise AchpApiError(r.status_code, str(detail or r.reason_phrase or "request failed"))
        return r.json()

    async def health(self) -> dict:
        return await self._json("GET", "/health")

    async def start_run(self, text: str, kb_id: str | None = None) -> dict:
        body: dict[str, Any] = {"input": {"type": "text", "text": text}}
        if kb_id:
            body["kb_id"] = kb_id
        return await self._json("POST", "/runs", json=body)

    async def run(self, run_id: str) -> dict:
        return await self._json("GET", f"/runs/{run_id}")

    async def events(self, run_id: str, since: int = 0) -> list[dict]:
        body = await self._json("GET", f"/runs/{run_id}/events.json", params={"since": since} if since else None)
        return body.get("events", [])

    async def libraries(self) -> list[dict]:
        return (await self._json("GET", "/kb/list")).get("knowledge_bases", [])

    async def chunks(self, kb_id: str) -> dict:
        return await self._json("GET", f"/kb/{kb_id}/chunks")

    async def ask(self, question: str, kb_id: str, top_k: int = 6) -> dict:
        return await self._json("POST", "/qa", json={"question": question, "kb_id": kb_id, "top_k": top_k})

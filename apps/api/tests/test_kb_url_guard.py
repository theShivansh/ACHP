"""A public backend must not fetch its own network for a user, and a library keeps the name the user gave it."""
from unittest.mock import AsyncMock

import pytest

from achp.kb.netguard import UnsafeURL, check_public_url


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://127.0.0.1:8000/health",
        "http://localhost/",
        "http://0.0.0.0/",
        "http://10.0.0.5/admin",
        "http://192.168.1.1/",
        "http://172.16.0.9/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://100.64.0.1/",  # carrier-grade NAT
        "http://user:secret@93.184.216.34/",  # credentials in the address
        "ftp://93.184.216.34/file",
        "file:///etc/passwd",
        "http://93.184.216.34:22/",  # not a web port
        "https:///nohost",
    ],
)
def test_addresses_inside_a_network_are_never_fetched(url):
    with pytest.raises(UnsafeURL):
        check_public_url(url)


@pytest.mark.parametrize("url", ["http://93.184.216.34/", "https://93.184.216.34:8443/page", "http://[2606:2800:220:1::1]/"])
def test_public_addresses_are_allowed(url):
    check_public_url(url)  # a literal address needs no DNS


def test_the_upload_endpoint_refuses_an_internal_url_before_creating_a_library(monkeypatch):
    from fastapi.testclient import TestClient

    import main

    ingest = AsyncMock()
    monkeypatch.setattr(main.kb_manager, "ingest_url", ingest)
    r = TestClient(main.app).post("/kb/upload", data={"url": "http://169.254.169.254/latest/meta-data/"})
    assert r.status_code == 400
    assert "private network" in r.json()["detail"]
    ingest.assert_not_called()


def test_the_name_the_user_gave_reaches_a_file_library(monkeypatch):
    from fastapi.testclient import TestClient

    import main
    from achp.kb.store import KBRecord

    seen = {}

    async def fake_ingest(filename, data, tags=None, name=None):
        seen.update(filename=filename, name=name)
        return KBRecord(kb_id="k1", name=name or filename, source_type="file", source_name=filename,
                        doc_count=1, chunk_count=1, created_at="2026-10-02T00:00:00Z", size_bytes=len(data),
                        status="ready", tags=[])

    monkeypatch.setattr(main.kb_manager, "ingest_file", fake_ingest)
    r = TestClient(main.app).post(
        "/kb/upload",
        files={"file": ("The Apple iPhone 15 Pro was release.txt", b"Some text that is long enough.", "text/plain")},
        data={"name": "Smartphone KB"},
    )
    assert r.status_code == 201
    assert seen["name"] == "Smartphone KB"
    assert r.json()["name"] == "Smartphone KB"


@pytest.mark.asyncio
async def test_a_public_page_cannot_redirect_the_fetch_inward():
    import httpx

    from achp.kb.store import kb_manager

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "93.184.216.34":
            return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})
        raise AssertionError(f"the internal address was fetched: {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=False) as client:
        with pytest.raises(UnsafeURL):
            await kb_manager._get_checked(client, "http://93.184.216.34/start")


@pytest.mark.asyncio
async def test_a_public_redirect_between_public_pages_is_followed():
    import httpx

    from achp.kb.store import kb_manager

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/start":
            return httpx.Response(301, headers={"location": "/final"})
        return httpx.Response(200, text="ok")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=False) as client:
        resp = await kb_manager._get_checked(client, "http://93.184.216.34/start")
    assert resp.status_code == 200 and resp.text == "ok"

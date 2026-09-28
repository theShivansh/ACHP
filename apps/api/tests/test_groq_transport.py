"""
GroqTransport against the real groq SDK, with the HTTP layer faked (no key, no network).

The runtime tests use a fake transport, so this is the only test that exercises the SDK's own
request/response handling. It caught groq ≥ 1.0 making `AsyncAPIResponse.parse()` a coroutine,
which failed every live run at the first model call.
"""
import json

import httpx
import pytest

groq = pytest.importorskip("groq")

from achp.llm.runtime import GroqTransport, TransportError  # noqa: E402

BODY = {
    "id": "chatcmpl-test", "object": "chat.completion", "created": 1, "model": "openai/gpt-oss-120b",
    "choices": [{"index": 0, "finish_reason": "stop",
                 "message": {"role": "assistant", "content": json.dumps({"claims": []})}}],
    "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18},
}


def transport_with(handler) -> GroqTransport:
    t = GroqTransport(api_key="test-not-a-key")
    t._client = groq.AsyncGroq(api_key="test-not-a-key", max_retries=0,
                               http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return t


async def call(t: GroqTransport):
    return await t(model="openai/gpt-oss-120b", messages=[{"role": "user", "content": "x"}],
                   response_format={"type": "json_object"}, max_completion_tokens=100,
                   temperature=0.1, reasoning_effort="low", timeout=10)


async def test_parses_a_completion_and_sends_no_reasoning():
    sent = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sent.update(json.loads(request.content))
        return httpx.Response(200, json=BODY, headers={"x-ratelimit-remaining-tokens": "900"})

    r = await call(transport_with(handler))
    assert json.loads(r.content) == {"claims": []}
    assert (r.finish_reason, r.prompt_tokens, r.completion_tokens) == ("stop", 11, 7)
    assert r.headers.get("x-ratelimit-remaining-tokens") == "900"
    assert sent["include_reasoning"] is False
    assert sent["reasoning_effort"] == "low" and sent["max_completion_tokens"] == 100


async def test_an_http_error_becomes_a_transport_error_with_headers():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "slow down"}}, headers={"retry-after": "7"})

    with pytest.raises(TransportError) as e:
        await call(transport_with(handler))
    assert e.value.status == 429
    assert {k.lower(): v for k, v in e.value.headers.items()}.get("retry-after") == "7"

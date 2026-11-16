import httpx
import pytest

from backend.ai_engine.provider import AIProviderError, OpenAICompatibleProvider


def test_llm_provider_parses_structured_response_without_logging_key(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "synthetic-provider-key")
    response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": '{"claims": []}'}}]},
        request=httpx.Request("POST", "https://provider.example.test/chat/completions"),
    )
    monkeypatch.setattr(
        "backend.ai_engine.provider.httpx.post",
        lambda *args, **kwargs: response,
    )

    assert OpenAICompatibleProvider().complete_json("system", "synthetic input") == {
        "claims": []
    }


@pytest.mark.parametrize(
    ("exception", "message"),
    [
        (
            httpx.TimeoutException("synthetic-provider-key"),
            "LLM request timed out.",
        ),
        (
            httpx.HTTPStatusError(
                "synthetic-provider-key",
                request=httpx.Request("POST", "https://provider.example.test"),
                response=httpx.Response(
                    401, request=httpx.Request("POST", "https://provider.example.test")
                ),
            ),
            "LLM authentication failed (HTTP 401).",
        ),
    ],
)
def test_llm_provider_sanitizes_timeout_and_auth_errors(
    monkeypatch, exception, message
):
    monkeypatch.setenv("LLM_API_KEY", "synthetic-provider-key")
    monkeypatch.setattr(
        "backend.ai_engine.provider.httpx.post",
        lambda *args, **kwargs: (_ for _ in ()).throw(exception),
    )

    with pytest.raises(AIProviderError) as error:
        OpenAICompatibleProvider().complete_json("system", "synthetic input")
    assert str(error.value) == message
    assert "synthetic-provider-key" not in str(error.value)


def test_llm_provider_rejects_non_object_content(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "synthetic-provider-key")
    response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": '["not", "an", "object"]'}}]},
        request=httpx.Request("POST", "https://provider.example.test/chat/completions"),
    )
    monkeypatch.setattr(
        "backend.ai_engine.provider.httpx.post",
        lambda *args, **kwargs: response,
    )

    with pytest.raises(AIProviderError, match="JSON object"):
        OpenAICompatibleProvider().complete_json("system", "synthetic input")

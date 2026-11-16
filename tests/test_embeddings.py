from types import SimpleNamespace

import httpx
import pytest

from backend.ai_engine.embeddings import (
    EmbeddingProviderError,
    OpenAICompatibleEmbeddingProvider,
)
from backend.database.vector import VECTOR_DIMENSIONS


def test_embedding_provider_validates_and_orders_vectors(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "synthetic-test-key")
    monkeypatch.setenv("EMBEDDING_MODEL", "test-embedding-model")
    provider = OpenAICompatibleEmbeddingProvider()
    vectors = [
        [0.2] * VECTOR_DIMENSIONS,
        [0.8] * VECTOR_DIMENSIONS,
    ]
    monkeypatch.setattr(
        "backend.ai_engine.embeddings.httpx.post",
        lambda *args, **kwargs: SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "data": [
                    {"index": 1, "embedding": vectors[1]},
                    {"index": 0, "embedding": vectors[0]},
                ]
            },
        ),
    )

    assert provider.embed_texts(["first", "second"]) == vectors


@pytest.mark.parametrize(
    "payload",
    [
        {"data": [{"index": 0, "embedding": [0.0]}]},
        {"data": [{"index": True, "embedding": [0.0] * VECTOR_DIMENSIONS}]},
        {"data": [{"index": 0, "embedding": [float("nan")] * VECTOR_DIMENSIONS}]},
    ],
)
def test_embedding_provider_rejects_malformed_vectors(monkeypatch, payload):
    monkeypatch.setenv("EMBEDDING_API_KEY", "synthetic-test-key")
    monkeypatch.setenv("EMBEDDING_MODEL", "test-embedding-model")
    monkeypatch.setattr(
        "backend.ai_engine.embeddings.httpx.post",
        lambda *args, **kwargs: SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: payload,
        ),
    )
    with pytest.raises(EmbeddingProviderError):
        OpenAICompatibleEmbeddingProvider().embed_texts(["claim"])


def test_embedding_provider_sanitizes_transport_errors(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "never-log-this")
    monkeypatch.setattr(
        "backend.ai_engine.embeddings.httpx.post",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            httpx.ConnectError("never-log-this")
        ),
    )

    with pytest.raises(EmbeddingProviderError) as error:
        OpenAICompatibleEmbeddingProvider().embed_texts(["claim"])
    assert "never-log-this" not in str(error.value)

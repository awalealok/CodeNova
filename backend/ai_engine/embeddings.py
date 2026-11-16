import math
import os

import httpx

from backend.database.vector import VECTOR_DIMENSIONS


class EmbeddingProviderError(RuntimeError):
    pass


class OpenAICompatibleEmbeddingProvider:
    def __init__(self):
        self.api_key = os.getenv("EMBEDDING_API_KEY", "").strip()
        self.base_url = os.getenv(
            "EMBEDDING_BASE_URL",
            os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        ).rstrip("/")
        self.model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self.timeout = float(os.getenv("EMBEDDING_TIMEOUT_SECONDS", "30"))

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not self.configured:
            raise EmbeddingProviderError(
                "Embedding provider is not configured; vector retrieval is unavailable."
            )
        if not texts:
            return []

        try:
            response = httpx.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": texts},
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise EmbeddingProviderError("Embedding response must be a JSON object.")
            data = payload.get("data")
            if not isinstance(data, list) or len(data) != len(texts):
                raise EmbeddingProviderError("Embedding response has an invalid data shape.")
            vectors: list[list[float] | None] = [None] * len(texts)
            for item in data:
                if not isinstance(item, dict):
                    raise EmbeddingProviderError("Embedding response contains an invalid item.")
                index = item.get("index")
                vector = item.get("embedding")
                if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(texts):
                    raise EmbeddingProviderError("Embedding response contains an invalid index.")
                if vectors[index] is not None or not isinstance(vector, list):
                    raise EmbeddingProviderError("Embedding response contains duplicate or invalid vectors.")
                if len(vector) != VECTOR_DIMENSIONS:
                    raise EmbeddingProviderError(
                        f"Embedding dimension must be {VECTOR_DIMENSIONS}."
                    )
                converted: list[float] = []
                for value in vector:
                    if isinstance(value, bool) or not isinstance(value, (int, float)):
                        raise EmbeddingProviderError("Embedding values must be numeric.")
                    number = float(value)
                    if not math.isfinite(number):
                        raise EmbeddingProviderError("Embedding values must be finite.")
                    converted.append(number)
                vectors[index] = converted
            if any(vector is None for vector in vectors):
                raise EmbeddingProviderError("Embedding response is missing vectors.")
            return [vector for vector in vectors if vector is not None]
        except EmbeddingProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise EmbeddingProviderError("Embedding request timed out.") from exc
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in {401, 403}:
                raise EmbeddingProviderError(
                    f"Embedding provider authentication failed (HTTP {status})."
                ) from exc
            raise EmbeddingProviderError(
                f"Embedding provider returned HTTP {status}."
            ) from exc
        except httpx.HTTPError as exc:
            raise EmbeddingProviderError("Embedding transport failed.") from exc
        except (ValueError, KeyError, TypeError) as exc:
            raise EmbeddingProviderError(
                "Embedding provider returned an invalid response."
            ) from exc

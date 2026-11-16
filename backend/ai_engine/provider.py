"""OpenAI-compatible LLM provider. No key means explicit deterministic-only mode."""
import json
import os

import httpx


class AIProviderError(RuntimeError):
    pass


class OpenAICompatibleProvider:
    def __init__(self):
        self.api_key = os.getenv("LLM_API_KEY", "").strip()
        self.base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "45"))

    @property
    def enabled(self):
        return bool(self.api_key)

    def complete_json(self, system_prompt: str, user_prompt: str) -> dict:
        if not self.enabled:
            raise AIProviderError(
                "LLM_API_KEY is not configured; deterministic-only mode is active."
            )
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        try:
            response = httpx.post(url, headers=headers, json=body, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise AIProviderError("LLM response must be a JSON object.")
            choices = payload.get("choices")
            if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                raise AIProviderError("LLM response does not contain a valid choice.")
            message = choices[0].get("message")
            if not isinstance(message, dict) or not isinstance(message.get("content"), str):
                raise AIProviderError("LLM response does not contain text content.")
            content = message["content"]
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise AIProviderError("LLM response content must be a JSON object.")
            return parsed
        except AIProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise AIProviderError("LLM request timed out.") from exc
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in {401, 403}:
                raise AIProviderError(f"LLM authentication failed (HTTP {status}).") from exc
            raise AIProviderError(f"LLM provider returned HTTP {status}.") from exc
        except httpx.HTTPError as exc:
            raise AIProviderError("LLM transport failed.") from exc
        except (ValueError, TypeError, KeyError, IndexError) as exc:
            raise AIProviderError("LLM provider returned an invalid response.") from exc

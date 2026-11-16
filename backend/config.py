import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _read_demo_auth_mode() -> bool:
    value = os.getenv("DEMO_AUTH_MODE", "false").strip().lower()
    if value not in {"true", "false"}:
        raise RuntimeError("DEMO_AUTH_MODE must be either true or false.")

    enabled = value == "true"
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    if enabled and app_env not in {"development", "dev", "local", "test"}:
        raise RuntimeError(
            "DEMO_AUTH_MODE is restricted to local development and test environments."
        )
    return enabled


DEMO_AUTH_MODE = _read_demo_auth_mode()

"""Centralised configuration.

All settings are loaded from environment variables (with `.env` as a fallback for
local dev) so the API and Celery worker stay 12-factor and so docker-compose can
inject service hostnames at runtime.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Redis / Celery -------------------------------------------------------
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # --- Storage --------------------------------------------------------------
    # Paths are absolute inside the container; on the host they live under ./storage.
    storage_root: Path = Path("/code/storage")
    upload_dir: Path = Path("/code/storage/uploads")
    output_dir: Path = Path("/code/storage/outputs")

    # --- Demucs ---------------------------------------------------------------
    # htdemucs is the 4-stem default and produces vocals/drums/bass/other.
    demucs_model: str = "htdemucs"
    # "cpu" for local; "cuda" if you've wired a GPU into the worker container.
    demucs_device: str = "cpu"

    # --- API ------------------------------------------------------------------
    # Public base URL the API embeds in /status responses (override behind a proxy).
    api_base_url: str = "http://localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()

# Make sure runtime dirs exist — saves the API/worker from a first-request crash.
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)

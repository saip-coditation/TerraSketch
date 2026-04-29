"""Application settings, loaded from environment variables / .env file."""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "TerraSketch"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    ANTHROPIC_API_KEY: str = Field(default="", description="Anthropic Claude API key")
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"
    GEMINI_API_KEY: str = Field(default="", description="Google Gemini API key")
    GEMINI_MODEL: str = "gemini-2.0-flash"
    LLM_PROVIDER: str = "anthropic"
    LLM_FALLBACK_PROVIDER: str = "mock"

    # Azure OpenAI (Microsoft Foundry): GPT-4o deployment — use your deployment *name*
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = ""
    # See https://learn.microsoft.com/azure/ai-services/openai/reference — pick one your region supports.
    AZURE_OPENAI_API_VERSION: str = "2024-10-21"

    DATABASE_URL: str = "sqlite:///./terrasketch.db"

    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    RATE_LIMIT_GENERATE: str = "5/minute"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @field_validator("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_API_VERSION")
    @classmethod
    def _strip_azure(cls, value: str) -> str:
        return value.strip()

    @field_validator("ANTHROPIC_MODEL", "GEMINI_MODEL", "LLM_PROVIDER", "LLM_FALLBACK_PROVIDER")
    @classmethod
    def _strip_lower(cls, value: str) -> str:
        return value.strip().lower()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()

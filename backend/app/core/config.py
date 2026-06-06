"""Application settings, loaded from environment variables / .env file."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Used only when APP_ENV=development and ADMIN_UI_PASSWORD is unset (see resolved_admin_ui_password).
DEV_ADMIN_UI_PASSWORD_FALLBACK: str = "terrasketch-dev-admin"


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
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    # Higher values reduce truncation of large JSON Terraform payloads; lower if the API rejects the request.
    ANTHROPIC_MAX_TOKENS: int = Field(default=16384, ge=1024, le=200000)
    AGENT_MAX_FIX_ITERATIONS: int = Field(default=3, ge=1, le=10)
    AGENT_MOCK_MODE: bool = Field(
        default=False,
        description="When true, v2 agent nodes return static mock responses without calling any LLM. Useful for testing the pipeline without an API key.",
    )
    SYNTHESIZE_MODE: str = Field(
        default="llm",
        description="'llm' (default) uses Claude to write HCL. 'deterministic' uses the Python HCL writer (no LLM call). 'hybrid' tries deterministic first, falls back to LLM for unknown types.",
    )
    CANONICAL_OVERRIDE_ENABLED: bool = Field(
        default=True,
        description="When false, disables the AWS microservice canonical template override. v2 never applies it.",
    )
    V1_VALIDATE_FIX_ENABLED: bool = Field(
        default=False,
        description="When true, v1 pipeline runs terraform validate + LLM fixer loop (up to AGENT_MAX_FIX_ITERATIONS). Requires ANTHROPIC_API_KEY and terraform CLI.",
    )
    ANTHROPIC_EXTENDED_THINKING: bool = False
    ANTHROPIC_THINKING_BUDGET_TOKENS: int = Field(default=4096, ge=1024, le=32000)
    ANTHROPIC_STREAM: bool = False
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
    AZURE_OPENAI_MAX_TOKENS: int = Field(default=16384, ge=256, le=128000)

    DATABASE_URL: str = "sqlite:///./terrasketch.db"

    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # development: allow phone browsers hitting http://192.168.x.x:5173 without listing every IP
    CORS_ALLOW_PRIVATE_NETWORK: bool = True

    RATE_LIMIT_GENERATE: str = "5/minute"
    RATE_LIMIT_AUTH: str = "20/minute"

    # Google OAuth — set to your Google Cloud OAuth 2.0 Client ID to enable "Sign in with Google".
    GOOGLE_CLIENT_ID: str = Field(default="", description="Google OAuth 2.0 Client ID for Sign-in with Google")

    # HS256 signing secret for JWT access tokens. Override in production.
    JWT_SECRET: str = "change-me-in-production-use-a-long-random-string"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Optional Django-style DB admin at /admin (SQLAdmin).
    ADMIN_UI_USER: str = "admin"
    ADMIN_UI_PASSWORD: str = ""
    # When false, /admin is never mounted (even in development).
    ADMIN_UI_ENABLED: bool = True
    ADMIN_SESSION_SECRET: str = ""

    # When true, skip `terraform validate` subprocess after generation (faster local dev).
    SKIP_TERRAFORM_VALIDATE: bool = False

    # SMTP email for feedback notifications (leave blank to disable silently)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FEEDBACK_EMAIL: str = "phapalesai25@gmail.com"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    def resolved_admin_ui_password(self) -> str:
        """Password SQLAdmin uses for login. Non-empty enables /admin (see main.py)."""
        if not self.ADMIN_UI_ENABLED:
            return ""
        explicit = (self.ADMIN_UI_PASSWORD or "").strip()
        if explicit:
            return explicit
        if self.APP_ENV.lower() == "development":
            return DEV_ADMIN_UI_PASSWORD_FALLBACK
        return ""

    @property
    def uses_dev_admin_password_default(self) -> bool:
        return (
            self.ADMIN_UI_ENABLED
            and self.APP_ENV.lower() == "development"
            and not (self.ADMIN_UI_PASSWORD or "").strip()
        )

    @field_validator(
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_DEPLOYMENT",
        "AZURE_OPENAI_API_VERSION",
    )
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

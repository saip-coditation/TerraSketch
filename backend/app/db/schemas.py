"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

CloudProvider = Literal["aws", "azure", "gcp"]
Environment = Literal["dev", "staging", "production"]
InputType = Literal["image", "text", "draw"]
ArchitecturePreset = Literal["auto", "simple_web", "microservice", "serverless"]


class GenerateRequest(BaseModel):
    cloud_provider: CloudProvider
    environment: Environment = "dev"
    input_type: InputType
    architecture_preset: ArchitecturePreset = Field(
        default="auto",
        description="Steers the model toward a common architecture pattern.",
    )
    correction_note: str | None = Field(
        default=None,
        description="Extra instructions merged into the prompt (refinement / fix-ups).",
        max_length=8000,
    )
    compare_generation_id: str | None = Field(
        default=None,
        description="If set, summarize file-level diffs vs this prior generation.",
        max_length=36,
    )
    image_base64: str | None = Field(
        default=None,
        description="data URL or raw base64 image content. Required when input_type='image'.",
    )
    text_description: str | None = Field(
        default=None,
        description="Text description of the architecture. Required when input_type='text' or 'draw'.",
    )
    session_id: str = Field(min_length=1, max_length=255)
    dry_run: bool = Field(
        default=False,
        description="When true, run generation but do not persist the result.",
    )

    @field_validator("image_base64")
    @classmethod
    def _validate_image_size(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if len(value) > 12_000_000:
            raise ValueError("image_base64 too large (max ~9MB raw image)")
        return value

    def ensure_input_consistency(self) -> None:
        if self.input_type == "image" and not self.image_base64:
            raise ValueError("image_base64 is required when input_type='image'")
        if self.input_type in ("text", "draw") and not (self.text_description or "").strip():
            raise ValueError("text_description is required when input_type is 'text' or 'draw'")


class GeneratedFiles(BaseModel):
    main_tf: str = Field(alias="main.tf")
    variables_tf: str = Field(alias="variables.tf")
    outputs_tf: str = Field(alias="outputs.tf")
    providers_tf: str = Field(alias="providers.tf")

    model_config = {"populate_by_name": True}


class GenerateResponse(BaseModel):
    generation_id: str
    cloud_provider: CloudProvider
    environment: Environment
    input_type: InputType = "text"
    input_description: str | None = None
    resources_identified: list[str] = []
    assumptions: list[str] = []
    files: dict[str, str]
    usage_instructions: str | None = None
    diagram_match_percent: int = 0
    improvement_advice: list[str] = []
    security_warnings: list[str] = []
    terraform_validation: dict[str, Any] | None = None
    file_diff_summary: dict[str, Any] | None = None
    confidence_scores: dict[str, int] = {}
    placeholders: list[str] = []
    request_id: str | None = None
    created_at: datetime


class HistoryItem(BaseModel):
    generation_id: str
    cloud_provider: CloudProvider
    environment: Environment
    input_type: InputType
    resources_identified: list[str] = []
    diagram_match_percent: int | None = None
    created_at: datetime


class FeedbackRequest(BaseModel):
    generation_id: str
    rating: int = Field(ge=1, le=5)
    comment: str | None = None
    feedback_type: str | None = Field(default=None, max_length=50)


class FeedbackResponse(BaseModel):
    id: str
    generation_id: str
    user_id: str | None = None
    feedback_type: str | None = None
    rating: int
    comment: str | None = None
    created_at: datetime


class ClaudeOutput(BaseModel):
    """The expected JSON shape coming back from Claude."""

    provider: CloudProvider
    assumptions: list[str] = []
    resources_identified: list[str] = []
    files: dict[str, str]
    usage_instructions: str | None = None
    confidence_scores: dict[str, int] = {}
    placeholders: list[str] = []


class HealthResponse(BaseModel):
    status: str = "ok"
    app: str
    version: str
    env: str
    database_ok: bool = True
    llm_provider: str = ""
    llm_configured: bool = False


class ErrorResponse(BaseModel):
    detail: str
    extra: dict[str, Any] | None = None


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=255)
    marketing_opt_in: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: str
    email: str
    name: str | None = None
    marketing_opt_in: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class AttachSessionBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)


class GoogleAuthBody(BaseModel):
    id_token: str = Field(min_length=1, description="Google ID token from the GSI credential response")
    session_id: str = Field(min_length=1, max_length=255)

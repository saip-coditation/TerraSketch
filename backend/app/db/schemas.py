"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

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
    correction_note: Optional[str] = Field(
        default=None,
        description="Extra instructions merged into the prompt (refinement / fix-ups).",
        max_length=8000,
    )
    compare_generation_id: Optional[str] = Field(
        default=None,
        description="If set, summarize file-level diffs vs this prior generation.",
        max_length=36,
    )
    image_base64: Optional[str] = Field(
        default=None,
        description="data URL or raw base64 image content. Required when input_type='image'.",
    )
    text_description: Optional[str] = Field(
        default=None,
        description="Text description of the architecture. Required when input_type='text' or 'draw'.",
    )
    session_id: str = Field(min_length=1, max_length=255)

    @field_validator("image_base64")
    @classmethod
    def _validate_image_size(cls, value: Optional[str]) -> Optional[str]:
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
    resources_identified: List[str] = []
    assumptions: List[str] = []
    files: Dict[str, str]
    usage_instructions: Optional[str] = None
    diagram_match_percent: int = 0
    improvement_advice: List[str] = []
    security_warnings: List[str] = []
    terraform_validation: Optional[Dict[str, Any]] = None
    file_diff_summary: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    created_at: datetime


class HistoryItem(BaseModel):
    generation_id: str
    cloud_provider: CloudProvider
    environment: Environment
    input_type: InputType
    resources_identified: List[str] = []
    diagram_match_percent: Optional[int] = None
    created_at: datetime


class FeedbackRequest(BaseModel):
    generation_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    generation_id: str
    rating: int
    comment: Optional[str] = None
    created_at: datetime


class ClaudeOutput(BaseModel):
    """The expected JSON shape coming back from Claude."""

    provider: CloudProvider
    assumptions: List[str] = []
    resources_identified: List[str] = []
    files: Dict[str, str]
    usage_instructions: Optional[str] = None


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
    extra: Optional[Dict[str, Any]] = None


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = Field(default=None, max_length=255)
    marketing_opt_in: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    marketing_opt_in: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class AttachSessionBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)

"""Optional preset and user correction text merged into LLM prompts."""

from __future__ import annotations

from typing import Optional

ArchitecturePreset = str  # auto | simple_web | microservice | serverless

_PRESET_TEXT = {
    "auto": "",
    "simple_web": (
        "Architecture preset — simple web (3-tier): VPC with Internet Gateway; public subnets "
        "for an internet-facing Application Load Balancer; private subnets for two (or more) web "
        "EC2 instances with IAM instance profile; private DB subnets for RDS MySQL; security groups "
        "allowing ALB→web (HTTP) and web→DB (3306); route tables (public to IGW, private with NAT "
        "if needed); ALB listener, target group, and attachments to instances."
    ),
    "microservice": (
        "Architecture preset — microservices reference: CloudFront with two origins (S3 static via OAC "
        "and ALB for API), ECS Fargate behind ALB, ElastiCache Redis, Aurora cluster plus instance, "
        "DynamoDB; single aws provider block only in providers.tf; wire SGs so only ECS reaches cache/DB."
    ),
    "serverless": (
        "Architecture preset — serverless: API Gateway (HTTP or REST), Lambda functions, IAM least "
        "privilege, DynamoDB and/or RDS as needed, S3 for static assets, CloudWatch logging; minimal "
        "always-on compute unless diagram shows otherwise."
    ),
}


def build_generation_hints(
    *,
    architecture_preset: str,
    correction_note: Optional[str],
) -> str:
    preset = (architecture_preset or "auto").lower().strip()
    chunks: list[str] = []
    base = _PRESET_TEXT.get(preset, "")
    if base:
        chunks.append(base)
    note = (correction_note or "").strip()
    if note:
        chunks.append(f"User correction / refinement for this generation: {note}")
    return "\n\n".join(chunks).strip()

"""SQLAdmin: Django-like read/write UI for ORM models at /admin."""

from __future__ import annotations

import logging

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.core.config import get_settings
from app.db import models
from app.db.session import engine

logger = logging.getLogger(__name__)
_settings = get_settings()


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = (form.get("username") or "").strip()
        password = (form.get("password") or "").strip()
        expected_user = (_settings.ADMIN_UI_USER or "admin").strip()
        expected_pw = (_settings.ADMIN_UI_PASSWORD or "").strip()
        if not expected_pw:
            return False
        if username != expected_user or password != expected_pw:
            return False
        request.session.update({"admin_ui_ok": True})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("admin_ui_ok") is True


class UserAdmin(ModelView, model=models.User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    column_list = [
        models.User.id,
        models.User.email,
        models.User.name,
        models.User.provider,
        models.User.marketing_opt_in,
        models.User.created_at,
    ]
    column_searchable_list = [models.User.email, models.User.name]
    column_sortable_list = [models.User.email, models.User.created_at]
    column_details_list = [
        models.User.id,
        models.User.email,
        models.User.name,
        models.User.provider,
        models.User.password_hash,
        models.User.marketing_opt_in,
        models.User.created_at,
    ]
    form_excluded_columns = [models.User.password_hash, models.User.generations]
    can_create = False
    can_delete = True


class GenerationAdmin(ModelView, model=models.Generation):
    name = "Generation"
    name_plural = "Generations"
    icon = "fa-solid fa-diagram-project"
    column_list = [
        models.Generation.id,
        models.Generation.user_id,
        models.Generation.session_id,
        models.Generation.cloud_provider,
        models.Generation.environment,
        models.Generation.input_type,
        models.Generation.diagram_match_percent,
        models.Generation.created_at,
    ]
    column_searchable_list = [models.Generation.id, models.Generation.session_id]
    column_sortable_list = [models.Generation.created_at]
    can_create = False
    can_edit = False
    can_delete = True


class FeedbackAdmin(ModelView, model=models.Feedback):
    name = "Feedback"
    name_plural = "Feedback"
    icon = "fa-solid fa-star"
    column_list = [
        models.Feedback.id,
        models.Feedback.generation_id,
        models.Feedback.rating,
        models.Feedback.created_at,
    ]
    column_searchable_list = [models.Feedback.generation_id]
    column_sortable_list = [models.Feedback.created_at]
    can_create = False
    can_edit = False
    can_delete = True


def mount_admin(app) -> None:
    """Attach /admin when ADMIN_UI_PASSWORD is non-empty."""
    if not (_settings.ADMIN_UI_PASSWORD or "").strip():
        logger.info("Admin UI disabled (set ADMIN_UI_PASSWORD in .env to enable /admin).")
        return

    secret = (
        (_settings.ADMIN_SESSION_SECRET or _settings.JWT_SECRET or "change-me-admin-session").strip()
    )
    authentication_backend = AdminAuth(secret_key=secret)
    admin = Admin(
        app,
        engine,
        authentication_backend=authentication_backend,
        base_url="/admin",
        title="TerraSketch Admin",
    )
    admin.add_view(UserAdmin)
    admin.add_view(GenerationAdmin)
    admin.add_view(FeedbackAdmin)
    logger.info("Admin UI mounted at /admin (user=%s)", (_settings.ADMIN_UI_USER or "admin").strip())

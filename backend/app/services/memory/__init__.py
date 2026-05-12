"""Cross-run memory service.

MemoryService is the façade. Two implementations:
  - SqlPreferencesMemory: per-user preferences from the feedback/prefs tables (§6b P2).
  - PgvectorMemory: semantic retrieval of past runs via pgvector (§6b P1).

The façade is a Protocol so both can be swapped or composed without changing callers.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.agents.state import DiagramIR, GenerationTrace, TerraformFiles


class PastRun:
    def __init__(
        self,
        *,
        generation_id: str,
        diagram_ir: DiagramIR | None,
        files: TerraformFiles | None,
        validation_passed: bool,
        trace_summary: str = "",
    ) -> None:
        self.generation_id = generation_id
        self.diagram_ir = diagram_ir
        self.files = files
        self.validation_passed = validation_passed
        self.trace_summary = trace_summary


class Preferences:
    def __init__(self, *, dismissed_findings: list[str] | None = None, custom: dict | None = None) -> None:
        self.dismissed_findings: list[str] = dismissed_findings or []
        self.custom: dict = custom or {}


@runtime_checkable
class MemoryService(Protocol):
    async def retrieve_similar(self, ir: DiagramIR, k: int = 3) -> list[PastRun]: ...
    async def get_preferences(self, user_id: str | None) -> Preferences: ...
    async def record_run(self, trace: GenerationTrace, files: TerraformFiles | None) -> None: ...


class NullMemoryService:
    """No-op implementation used when pgvector is not available."""

    async def retrieve_similar(self, ir: DiagramIR, k: int = 3) -> list[PastRun]:
        return []

    async def get_preferences(self, user_id: str | None) -> Preferences:
        return Preferences()

    async def record_run(self, trace: GenerationTrace, files: TerraformFiles | None) -> None:
        pass


_default_memory: MemoryService = NullMemoryService()


def get_memory_service() -> MemoryService:
    return _default_memory


def set_memory_service(svc: MemoryService) -> None:
    global _default_memory
    _default_memory = svc

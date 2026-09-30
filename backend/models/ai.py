"""Pydantic contracts for UnoWord's user-scoped AI writing context."""

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AIModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class AIProfile(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    writing_goal: str | None = None
    writing_style: str | None = None
    audience: str | None = None
    primary_topics: list[str] = Field(default_factory=list)
    current_projects: list[str] = Field(default_factory=list)
    favorite_subjects: list[str] = Field(default_factory=list)
    avoid_topics: list[str] = Field(default_factory=list)
    personal_context: str | None = None
    ai_preferences: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AIProfileUpdate(AIModel):
    writing_goal: str | None = None
    writing_style: str | None = None
    audience: str | None = None
    primary_topics: list[str] = Field(default_factory=list)
    current_projects: list[str] = Field(default_factory=list)
    favorite_subjects: list[str] = Field(default_factory=list)
    avoid_topics: list[str] = Field(default_factory=list)
    personal_context: str | None = None
    ai_preferences: dict[str, Any] = Field(default_factory=dict)


class AIOnboardingAnswer(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    question_id: str
    question: str
    answer: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AIOnboardingAnswerUpsert(AIModel):
    question_id: str = Field(min_length=1, max_length=120)
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=10_000)


DocumentType = Literal[
    "memoir",
    "journal",
    "book",
    "research",
    "outline",
    "notes",
    "personal_history",
    "reference",
    "other",
]
ProcessingStatus = Literal["pending", "processing", "ready", "failed"]


class AIDocument(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    filename: str
    file_type: str
    storage_path: str
    document_title: str
    document_type: DocumentType = "other"
    processing_status: ProcessingStatus = "pending"
    processing_error: str | None = None
    summary: str | None = None
    word_count: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AIDocumentUpload(AIModel):
    filename: str = Field(min_length=1, max_length=255)
    file_type: str = Field(min_length=1, max_length=120)
    document_title: str = Field(min_length=1, max_length=300)
    document_type: DocumentType = "other"


class AIDocumentChunk(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    document_id: str
    chunk_index: int = Field(ge=0)
    content: str = Field(min_length=1, max_length=50_000)
    embedding: list[float] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class AIDocumentChunkCreate(AIModel):
    chunk_index: int = Field(ge=0)
    content: str = Field(min_length=1, max_length=50_000)
    embedding: list[float] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIWritingSession(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    existing_session_ref: str | None = None
    word_count: int = Field(ge=0)
    writing_duration_seconds: int = Field(ge=0)
    content: str | None = None
    save_to_memory: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class AIWritingSessionCreate(AIModel):
    existing_session_ref: str | None = None
    word_count: int = Field(default=0, ge=0)
    writing_duration_seconds: int = Field(default=0, ge=0)
    content: str | None = Field(default=None, max_length=100_000)
    save_to_memory: bool = False


class AIWritingChunk(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    writing_session_id: str
    chunk_index: int = Field(ge=0)
    content: str = Field(min_length=1, max_length=50_000)
    embedding: list[float] | None = None
    created_at: datetime = Field(default_factory=utc_now)


MemoryType = Literal[
    "person",
    "place",
    "event",
    "experience",
    "interest",
    "goal",
    "project",
    "theme",
    "unfinished_idea",
    "preference",
    "writing_pattern",
]


class AIMemory(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    memory_type: MemoryType
    memory: str = Field(min_length=1, max_length=5_000)
    importance: int = Field(default=3, ge=1, le=5)
    source_id: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AIMemoryCreate(AIModel):
    memory_type: MemoryType
    memory: str = Field(min_length=1, max_length=5_000)
    importance: int = Field(default=3, ge=1, le=5)
    source_id: str | None = None


SuggestionStatus = Literal["shown", "accepted", "rejected", "ignored", "written"]


class AISuggestion(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    title: str
    suggestion: str
    reason: str
    context_summary: str
    related_topics: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    status: SuggestionStatus = "shown"
    created_at: datetime = Field(default_factory=utc_now)


class AISuggestionRequest(AIModel):
    current_writing: str | None = Field(default=None, max_length=20_000)
    current_project: str | None = Field(default=None, max_length=2_000)


class AISuggestionResult(AIModel):
    title: str = Field(min_length=1, max_length=300)
    suggestion: str = Field(min_length=1, max_length=5_000)
    why: str = Field(min_length=1, max_length=5_000)
    related_topics: list[str] = Field(default_factory=list)


class AISuggestionFeedbackCreate(AIModel):
    suggestion_id: str
    helpful: bool
    reason: Literal[
        "already_written",
        "not_interested",
        "wrong_direction",
        "too_personal",
        "too_vague",
        "other",
    ] | None = None
    note: str | None = Field(default=None, max_length=2_000)


class AIFeedback(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    suggestion_id: str
    helpful: bool
    reason: str | None = None
    note: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class AIUsageEvent(AIModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    date: str
    request_type: str
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    estimated_cost: float | None = Field(default=None, ge=0)
    created_at: datetime = Field(default_factory=utc_now)


class AIStatus(AIModel):
    auth_configured: bool
    database: str
    database_configured: bool
    provider: str
    model: str
    retrieval_ready: bool
    message: str
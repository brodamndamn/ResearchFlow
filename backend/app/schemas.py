from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class ResearchMode(StrEnum):
    QUICK = "quick"
    DEEP = "deep"


class ResearchStatus(StrEnum):
    QUEUED = "queued"
    PLANNING = "planning"
    WAITING_FOR_REVIEW = "waiting_for_review"
    RESEARCHING = "researching"
    WRITING = "writing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ResearchPlan(BaseModel):
    focus: str = Field(min_length=2, max_length=300)
    subqueries: list[str] = Field(min_length=1, max_length=6)

    @field_validator("subqueries")
    @classmethod
    def normalize_subqueries(cls, value: list[str]) -> list[str]:
        normalized = [item.strip() for item in value if item.strip()]
        if not normalized:
            raise ValueError("至少需要一个检索子问题")
        return list(dict.fromkeys(normalized))


class ResearchCreate(BaseModel):
    topic: str = Field(min_length=10, max_length=300)
    mode: ResearchMode = ResearchMode.QUICK

    @field_validator("topic", mode="before")
    @classmethod
    def normalize_topic(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class SourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: HttpUrl
    title: str
    snippet: str | None = None


class ResearchReport(BaseModel):
    title: str
    markdown: str
    source_ids: list[str] = Field(default_factory=list)


class ResearchEvent(BaseModel):
    phase: str
    message: str
    timestamp: datetime
    status: str


class ResearchSnapshot(BaseModel):
    run_id: str
    mode: ResearchMode
    status: ResearchStatus
    query: str
    plan: ResearchPlan | None = None
    sources: list[SourceRead] = Field(default_factory=list)
    report: ResearchReport | None = None
    metrics: dict[str, int | float] = Field(default_factory=dict)
    events: list[ResearchEvent] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime
    updated_at: datetime

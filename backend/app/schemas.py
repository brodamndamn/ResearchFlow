from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ResearchMode(StrEnum):
    QUICK = "quick"
    DEEP = "deep"


class ResearchStatus(StrEnum):
    QUEUED = "queued"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ResearchPlan(BaseModel):
    steps: list[str] = Field(min_length=1)


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


class ResearchSnapshot(BaseModel):
    run_id: str
    mode: ResearchMode
    status: ResearchStatus
    query: str
    plan: ResearchPlan | None = None
    sources: list[SourceRead] = Field(default_factory=list)
    report: ResearchReport | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime

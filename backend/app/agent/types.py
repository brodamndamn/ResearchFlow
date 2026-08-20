from __future__ import annotations

from enum import StrEnum
from typing import TypedDict

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ResearchMode(StrEnum):
    QUICK = "quick"
    DEEP = "deep"


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


class SearchDocument(BaseModel):
    url: HttpUrl
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1)
    score: float = Field(default=0, ge=0)
    published_at: str | None = None


class Evidence(BaseModel):
    source_id: int = Field(ge=1)
    claim: str = Field(min_length=1)
    excerpt: str = Field(min_length=1)


class EvidenceBundle(BaseModel):
    evidence: list[Evidence]


class GapQueries(BaseModel):
    queries: list[str] = Field(default_factory=list, max_length=2)


class ResearchState(TypedDict, total=False):
    topic: str
    mode: str
    status: str
    plan: dict
    sources: list[dict]
    evidence: list[dict]
    report: str
    metrics: dict[str, int | float]


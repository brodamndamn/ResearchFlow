from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.schemas import ResearchMode, ResearchStatus


def _new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class ResearchRun(Base):
    __tablename__ = "research_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    client_hash: Mapped[str] = mapped_column(String(64), index=True)
    mode: Mapped[ResearchMode] = mapped_column(
        Enum(
            ResearchMode,
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        )
    )
    query: Mapped[str] = mapped_column(Text)
    status: Mapped[ResearchStatus] = mapped_column(
        Enum(
            ResearchStatus,
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        index=True,
    )
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    sources: Mapped[list[Source]] = relationship(back_populates="run", cascade="all, delete-orphan")
    showcase: Mapped[Showcase | None] = relationship(
        back_populates="run", cascade="all, delete-orphan", uselist=False
    )


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("research_runs.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped[ResearchRun] = relationship(back_populates="sources")


class RateUsage(Base):
    __tablename__ = "rate_usage"
    __table_args__ = (
        UniqueConstraint("client_hash", "usage_date", "mode", name="uq_rate_usage_client_day_mode"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    client_hash: Mapped[str] = mapped_column(String(64), index=True)
    usage_date: Mapped[date] = mapped_column(Date, index=True)
    mode: Mapped[ResearchMode] = mapped_column(
        Enum(
            ResearchMode,
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        )
    )
    count: Mapped[int] = mapped_column(Integer, default=0)


class Showcase(Base):
    __tablename__ = "showcases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("research_runs.id", ondelete="CASCADE"), unique=True, index=True
    )
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped[ResearchRun] = relationship(back_populates="showcase")

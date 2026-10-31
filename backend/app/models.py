from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, Index, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.timeutil import utcnow


class User(SQLModel, table=True):
    __tablename__ = "users"

    user_id: str = Field(primary_key=True, max_length=36)
    nickname: str | None = Field(default=None, max_length=32)
    created_at: datetime = Field(default_factory=utcnow)
    last_active_at: datetime = Field(default_factory=utcnow)
    consent_version: str | None = Field(default=None, max_length=16)
    consent_at: datetime | None = None
    analytics: bool = False
    is_demo: bool = False


class Event(SQLModel, table=True):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_user_ts", "user_id", "ts"),)

    event_id: str = Field(primary_key=True, max_length=36)
    user_id: str = Field(foreign_key="users.user_id", max_length=36)
    session_id: str = Field(index=True, max_length=36)
    round_id: str | None = Field(default=None, index=True, max_length=36)
    ts: datetime
    source: str = Field(max_length=16)
    type: str = Field(index=True, max_length=40)
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    received_at: datetime = Field(default_factory=utcnow)


class Observation(SQLModel, table=True):

    __tablename__ = "observations"
    __table_args__ = (
        Index("ix_observations_user_ts", "user_id", "ts"),
        UniqueConstraint("user_id", "source_key"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.user_id", max_length=36)
    source_key: str = Field(max_length=128)
    kind: str = Field(max_length=16)
    ref: str = Field(index=True, max_length=36)
    session_id: str = Field(max_length=36)
    dimension: str = Field(max_length=16)
    value: float
    noise: float
    ts: datetime


class Snapshot(SQLModel, table=True):
    __tablename__ = "snapshots"
    __table_args__ = (Index("ix_snapshots_user_ts", "user_id", "ts"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.user_id", max_length=36)
    ts: datetime
    trigger: str = Field(max_length=16)
    dimensions: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))


class Goal(SQLModel, table=True):
    __tablename__ = "goals"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.user_id", index=True, max_length=36)
    dimension: str = Field(max_length=16)
    target: float
    created_at: datetime = Field(default_factory=utcnow)
    baseline: float | None = None


class DeletedUser(SQLModel, table=True):

    __tablename__ = "deleted_users"

    user_hash: str = Field(primary_key=True, max_length=64)
    deleted_at: datetime = Field(default_factory=utcnow)

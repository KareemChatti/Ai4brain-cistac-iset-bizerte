"""Caches LLM reviews per round so a refresh doesn't pay again.

Uses a CoachReview table in Member 2's database when app.db is there, otherwise memory.
Template reviews are not cached: they are free, and the LLM may be back next time.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Session, SQLModel, select

from .schemas import Review


class CoachReview(SQLModel, table=True):
    round_id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    review_json: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


_memory: dict[str, tuple[str, str]] = {}  # round_id -> (user_id, review json)
_table_ready = False


def _engine():
    global _table_ready
    try:
        from app.db import engine  # Member 2
    except ImportError:
        return None
    if not _table_ready:
        SQLModel.metadata.create_all(engine, tables=[CoachReview.__table__])
        _table_ready = True
    return engine


def get_cached(round_id: str) -> Optional[Review]:
    engine = _engine()
    if engine is None:
        raw = _memory.get(round_id, ("", None))[1]
    else:
        with Session(engine) as s:
            row = s.exec(select(CoachReview).where(CoachReview.round_id == round_id)).first()
            raw = row.review_json if row else None
    return Review.model_validate_json(raw) if raw else None


def put_cached(user_id: str, review: Review) -> None:
    raw = review.model_dump_json()
    engine = _engine()
    if engine is None:
        _memory[review.round_id] = (user_id, raw)
        return
    with Session(engine) as s:
        s.merge(CoachReview(round_id=review.round_id, user_id=user_id, review_json=raw))
        s.commit()


def delete_user(user_id: str) -> None:
    """For Member 2's DELETE /api/data/{user_id}."""
    engine = _engine()
    if engine is None:
        for rid in [r for r, (uid, _) in _memory.items() if uid == user_id]:
            del _memory[rid]
        return
    with Session(engine) as s:
        for row in s.exec(select(CoachReview).where(CoachReview.user_id == user_id)):
            s.delete(row)
        s.commit()


def clear_memory() -> None:
    _memory.clear()

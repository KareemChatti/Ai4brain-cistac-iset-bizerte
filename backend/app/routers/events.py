import logging
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import Table, insert, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlmodel import Session, select

from app.db import get_session
from app.models import DeletedUser, Event, User
from app.privacy import user_hash
from app.schemas import EventBatch, EventIn, EventsAccepted
from app.scoring import pipeline
from app.timeutil import to_utc, utcnow

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["events"])


@router.post("/events", response_model=EventsAccepted)
def post_events(batch: EventBatch, session: Session = Depends(get_session)) -> EventsAccepted:
    ingest(session, batch.events)
    return EventsAccepted(accepted=len(batch.events))


def ingest(session: Session, events: list[EventIn]) -> list[EventIn]:
    new_events = store_events(session, events)
    by_user: dict[str, list[EventIn]] = defaultdict(list)
    for event in new_events:
        by_user[str(event.user_id)].append(event)
    for user_id, user_events in by_user.items():
        try:
            pipeline.on_new_events(user_id, user_events)
        except Exception:
            log.exception("Scoring pipeline failed for user %s", user_id)
    return new_events


def store_events(session: Session, events: list[EventIn]) -> list[EventIn]:
    unique: dict[str, EventIn] = {}
    for event in events:
        unique.setdefault(str(event.event_id), event)
    if not unique:
        return []

    user_ids = {str(e.user_id) for e in unique.values()}
    hashes = {user_hash(uid): uid for uid in user_ids}
    deleted = session.exec(select(DeletedUser.user_hash).where(DeletedUser.user_hash.in_(hashes))).all()
    deleted_ids = {hashes[h] for h in deleted}
    if deleted_ids:
        log.info("Dropping events of %d deleted user(s)", len(deleted_ids))

    stored = set(session.exec(select(Event.event_id).where(Event.event_id.in_(unique))).all())
    new = [e for key, e in unique.items() if key not in stored and str(e.user_id) not in deleted_ids]
    active_users = user_ids - deleted_ids

    now = utcnow()
    if active_users:
        _insert_ignore(session, User.__table__, [
            {"user_id": uid, "created_at": now, "last_active_at": now, "analytics": False, "is_demo": False}
            for uid in active_users
        ], key="user_id")
        session.exec(update(User).where(User.user_id.in_(active_users)).values(last_active_at=now))
    if new:
        _insert_ignore(session, Event.__table__, [_row(e, now) for e in new], key="event_id")
    session.commit()
    return new


def _row(event: EventIn, received_at: Any) -> dict[str, Any]:
    return {
        "event_id": str(event.event_id),
        "user_id": str(event.user_id),
        "session_id": str(event.session_id),
        "round_id": str(event.round_id) if event.round_id else None,
        "ts": to_utc(event.ts),
        "source": event.source,
        "type": event.type,
        "payload": event.payload,
        "received_at": received_at,
    }


def _insert_ignore(session: Session, table: Table, rows: list[dict[str, Any]], key: str) -> None:
    dialect = session.get_bind().dialect.name
    if dialect == "sqlite":
        stmt = sqlite.insert(table).on_conflict_do_nothing(index_elements=[key])
    elif dialect == "postgresql":
        stmt = postgresql.insert(table).on_conflict_do_nothing(index_elements=[key])
    else:
        stmt = insert(table)
    session.connection().execute(stmt, rows)

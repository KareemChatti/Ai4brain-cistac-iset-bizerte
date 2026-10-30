"""Retention: raw events older than RETENTION_DAYS (90) are deleted, and users inactive for
INACTIVE_DAYS (180) are deleted with everything about them.

Runs once at startup and then every 24 hours (see app/main.py). The derived scores
(observations and snapshots) are kept for active users, so their Brain Twin and its
history survive the deletion of the raw events. Simulated demo players are never
removed for inactivity.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, func
from sqlmodel import Session, select

from app.config import settings
from app.db import session_scope
from app.models import Event, User
from app.routers.data import delete_user_data
from app.timeutil import utcnow

log = logging.getLogger(__name__)
DAY_SECONDS = 24 * 60 * 60


def run_retention(session: Session, now: datetime | None = None) -> dict[str, int]:
    """Apply both retention rules once and commit. Returns what was removed."""
    now = now or utcnow()
    event_cutoff = now - timedelta(days=settings.retention_days)
    user_cutoff = now - timedelta(days=settings.inactive_days)

    old_events = session.exec(select(func.count()).select_from(Event).where(Event.ts < event_cutoff)).one()
    session.exec(delete(Event).where(Event.ts < event_cutoff))

    inactive = session.exec(
        select(User.user_id).where(User.last_active_at < user_cutoff, User.is_demo == False)  # noqa: E712
    ).all()
    for uid in inactive:
        delete_user_data(session, uid)

    session.commit()
    result = {"events": int(old_events), "users": len(inactive)}
    if any(result.values()):
        log.info("Retention removed %(events)d old events and %(users)d inactive users", result)
    return result


def run_retention_now() -> dict[str, int]:
    with session_scope() as session:
        return run_retention(session)


async def retention_loop() -> None:
    """Run at startup, then once a day, until the server stops."""
    while True:
        try:
            await asyncio.to_thread(run_retention_now)
        except Exception:  # a failed run must never take the API down
            log.exception("Retention run failed")
        await asyncio.sleep(DAY_SECONDS)

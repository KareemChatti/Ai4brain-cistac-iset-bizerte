"""Profile and history read side. `get_profile` and `recent_round_ids` are also called
directly by the coach (Member 3), so they open their own database session."""

from datetime import datetime

from sqlalchemy import func
from sqlmodel import Session, select

from app.db import session_scope
from app.models import Event, Snapshot
from app.models import Observation as ObservationRow
from app.schemas import Profile, SnapshotOut
from app.scoring.frustration import suggest_break
from app.scoring.pipeline import load_observations
from app.scoring.twin import replay
from app.timeutil import iso, to_utc, utcnow


def build_profile(session: Session, user_id: str, now: datetime | None = None) -> Profile:
    """The twin as it stands now: replay every observation, then drift to `now`."""
    observations = load_observations(session, user_id)
    twin = replay(observations)
    now = to_utc(now or utcnow())
    if observations:
        now = max(now, max(to_utc(o.ts) for o in observations))

    counts = dict(session.exec(
        select(ObservationRow.kind, func.count(func.distinct(ObservationRow.ref)))
        .where(ObservationRow.user_id == user_id)
        .group_by(ObservationRow.kind)
    ).all())

    return Profile.model_validate({
        "user_id": user_id,
        "updated_at": iso(now),
        "dimensions": twin.estimates(now),
        "n_rounds": counts.get("round", 0),
        "n_minigames": counts.get("minigame", 0),
        "flags": {"suggest_break": suggest_break(session, user_id, now)},
    })


def build_history(session: Session, user_id: str) -> list[SnapshotOut]:
    rows = session.exec(select(Snapshot).where(Snapshot.user_id == user_id).order_by(Snapshot.ts, Snapshot.id)).all()
    return [SnapshotOut(ts=iso(r.ts), trigger=r.trigger, dimensions=r.dimensions) for r in rows]


def get_profile(user_id: str) -> Profile:
    with session_scope() as session:
        return build_profile(session, user_id)


def recent_round_ids(user_id: str, n: int = 3) -> list[str]:
    """Ids of the user's last `n` finished rounds, newest first."""
    with session_scope() as session:
        rows = session.exec(
            select(Event.round_id)
            .where(Event.user_id == user_id, Event.type == "round_end", Event.round_id.is_not(None))
            .order_by(Event.ts.desc())
        ).all()
    return list(dict.fromkeys(rows))[:n]

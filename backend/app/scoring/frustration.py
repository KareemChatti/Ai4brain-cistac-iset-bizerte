from datetime import datetime

from sqlmodel import Session, select

from app.models import Event
from app.scoring.rounds import fast_and_wrong_runs, finished_rounds, graded_turns
from app.timeutil import to_utc, utcnow

FAST_MS = 1500
WEAK_QUALITY = 0.4


def suggest_break(session: Session, user_id: str, now: datetime | None = None) -> bool:
    rounds = finished_rounds(session, user_id)
    if not rounds:
        return False
    last = rounds[-1]
    if last.abandoned:
        return True

    today = to_utc(now or utcnow()).date()
    recent = [r for r in rounds if to_utc(r.ts).date() == today][-3:]
    if len(recent) == 3 and not any(r.won for r in recent):
        return True

    events = session.exec(
        select(Event).where(Event.user_id == user_id, Event.round_id == last.round_id, Event.source == "rami")
    ).all()
    return bool(fast_and_wrong_runs(graded_turns(list(events)), FAST_MS, WEAK_QUALITY))

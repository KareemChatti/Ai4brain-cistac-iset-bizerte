from sqlmodel import Session, select

from app.models import Event


def user_events(session: Session, user_id: str, *types: str) -> list[Event]:
    stmt = select(Event).where(Event.user_id == user_id)
    if types:
        stmt = stmt.where(Event.type.in_(types))
    return list(session.exec(stmt.order_by(Event.ts, Event.event_id)).all())


def recent_session_ids(session: Session, user_id: str, n: int) -> list[str]:
    latest: dict[str, object] = {}
    for event in user_events(session, user_id):
        latest[event.session_id] = event.ts
    return sorted(latest, key=lambda s: latest[s], reverse=True)[:n]

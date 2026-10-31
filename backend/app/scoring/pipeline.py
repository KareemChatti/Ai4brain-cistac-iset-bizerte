from sqlalchemy import delete
from sqlmodel import Session, select

from app.db import session_scope
from app.models import Event
from app.models import Observation as ObservationRow
from app.models import Snapshot
from app.schemas import EventIn
from app.scoring.observations import Observation, round_observations, session_minigame_observations
from app.scoring.twin import replay_with_snapshots

MINIGAME_TYPES = ("trial", "minigame_end")


def on_new_events(user_id: str, events: list[EventIn]) -> None:
    rounds = {str(e.round_id) for e in events if e.source == "rami" and e.round_id}
    sessions = {str(e.session_id) for e in events if e.source == "minigame"}
    if not rounds and not sessions:
        return
    with session_scope() as session:
        for round_id in rounds:
            rescore_round(session, user_id, round_id)
        for session_id in sessions:
            rescore_minigame_session(session, user_id, session_id)
        rebuild_snapshots(session, user_id)
        session.commit()


def rescore_round(session: Session, user_id: str, round_id: str) -> None:
    events = session.exec(
        select(Event).where(Event.user_id == user_id, Event.round_id == round_id, Event.source == "rami")
    ).all()
    _replace(session, user_id, round_observations(events),
             ObservationRow.kind == "round", ObservationRow.ref == round_id)


def rescore_minigame_session(session: Session, user_id: str, session_id: str) -> None:
    events = session.exec(
        select(Event).where(
            Event.user_id == user_id, Event.session_id == session_id, Event.type.in_(MINIGAME_TYPES)
        )
    ).all()
    _replace(session, user_id, session_minigame_observations(events),
             ObservationRow.kind == "minigame", ObservationRow.session_id == session_id)


def _replace(session: Session, user_id: str, observations: list[Observation], *scope) -> None:
    session.exec(delete(ObservationRow).where(ObservationRow.user_id == user_id, *scope))
    for obs in observations:
        session.add(ObservationRow(
            user_id=user_id, source_key=obs.source_key, kind=obs.kind, ref=obs.ref,
            session_id=obs.session_id, dimension=obs.dimension, value=obs.value,
            noise=obs.noise, ts=obs.ts,
        ))
    session.flush()


def load_observations(session: Session, user_id: str) -> list[Observation]:
    rows = session.exec(select(ObservationRow).where(ObservationRow.user_id == user_id)).all()
    return [
        Observation(r.dimension, r.value, r.noise, r.ts, r.kind, r.ref, r.session_id)
        for r in rows
    ]


def rebuild_snapshots(session: Session, user_id: str) -> None:
    _, points = replay_with_snapshots(load_observations(session, user_id))
    session.exec(delete(Snapshot).where(Snapshot.user_id == user_id))
    for point in points:
        session.add(Snapshot(user_id=user_id, ts=point.ts, trigger=point.trigger, dimensions=point.dimensions))
    session.flush()

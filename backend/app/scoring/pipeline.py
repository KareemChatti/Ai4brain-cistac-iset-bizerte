"""Scoring pipeline: turns newly stored events into Brain Twin updates.

Called by POST /api/events after the events are committed, once per user, with
only the events that were not stored before. Task 2.2 fills this in
(observations -> Kalman update per dimension -> Snapshot).
"""

from app.schemas import EventIn


def on_new_events(user_id: str, events: list[EventIn]) -> None:
    return None

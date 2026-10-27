"""Heatmap: average observation value per dimension and time of day.

Times are shown in Tunisia time (UTC+1, no daylight saving), since stored event times are UTC.
"""

from collections import defaultdict
from datetime import timedelta

from sqlmodel import Session

from app.schemas import DIMENSIONS, Heatmap
from app.scoring.pipeline import load_observations
from app.timeutil import to_utc

LOCAL_OFFSET = timedelta(hours=1)
SLOTS: list[tuple[str, int, int]] = [
    ("08-12", 8, 12),
    ("12-16", 12, 16),
    ("16-20", 16, 20),
    ("20-24", 20, 24),
    ("00-08", 0, 8),
]


def slot_of(hour: int) -> str:
    return next(name for name, start, end in SLOTS if start <= hour < end)


def build_heatmap(session: Session, user_id: str) -> Heatmap:
    values: dict[tuple[str, str], list[float]] = defaultdict(list)
    for obs in load_observations(session, user_id):
        hour = (to_utc(obs.ts) + LOCAL_OFFSET).hour
        values[(obs.dimension, slot_of(hour))].append(obs.value)
    cells = [
        [round(sum(v) / len(v), 1) if (v := values.get((d, name))) else None for name, _, _ in SLOTS]
        for d in DIMENSIONS
    ]
    return Heatmap(rows=list(DIMENSIONS), cols=[name for name, _, _ in SLOTS], cells=cells)

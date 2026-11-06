from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from app.scoring.observations import R_ROUND, R_RUSHED, round_observations
from app.scoring.twin import Twin

T0 = datetime(2026, 11, 7, 18, 0, tzinfo=UTC)


@dataclass
class Ev:
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    ts: datetime = T0
    event_id: str = "e"
    session_id: str = "s1"
    round_id: str | None = "r1"


def round_events(think_ms: int, quality: float, turns: int = 6) -> list[Ev]:
    events = [Ev("round_start")]
    for n in range(1, turns + 1):
        events.append(Ev("turn", {"turn_no": n, "think_ms": think_ms, "options_count": 4}, ts=T0 + timedelta(seconds=n)))
        events.append(Ev("turn_graded", {"turn_no": n, "quality": quality}, ts=T0 + timedelta(seconds=n)))
    events.append(Ev("round_end", {"winner": "ai"}, ts=T0 + timedelta(minutes=5)))
    return events


def test_calm_round_keeps_normal_noise():
    obs = round_observations(round_events(think_ms=6000, quality=0.8))
    assert obs and all(o.noise == R_ROUND for o in obs)


def test_button_masher_round_is_flagged_as_uncertain():
    obs = round_observations(round_events(think_ms=300, quality=0.1))
    assert obs and all(o.noise == R_RUSHED for o in obs)


def test_rushed_round_moves_the_twin_less():
    calm, rushed = Twin(), Twin()
    for o in round_observations(round_events(think_ms=6000, quality=0.1)):
        calm.apply(o)
    for o in round_observations(round_events(think_ms=300, quality=0.1)):
        rushed.apply(o)
    assert abs(rushed.beliefs["reasoning"].mu - 50) < abs(calm.beliefs["reasoning"].mu - 50)
    assert rushed.beliefs["reasoning"].sigma > calm.beliefs["reasoning"].sigma

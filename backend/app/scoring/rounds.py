from dataclasses import dataclass, field
from typing import Any

from sqlmodel import Session

from app.models import Event
from app.scoring.history import user_events
from app.scoring.observations import num


@dataclass
class RoundResult:
    round_id: str
    session_id: str
    ts: Any
    won: bool
    abandoned: bool


def finished_rounds(session: Session, user_id: str) -> list[RoundResult]:
    return [
        RoundResult(
            round_id=e.round_id, session_id=e.session_id, ts=e.ts,
            won=e.payload.get("winner") == "user", abandoned=e.payload.get("abandoned") is True,
        )
        for e in user_events(session, user_id, "round_end")
        if e.round_id
    ]


@dataclass
class GradedTurn:
    turn_no: int
    payload: dict = field(default_factory=dict)

    @property
    def quality(self) -> float | None:
        return num(self.payload, "quality")

    @property
    def think_ms(self) -> float | None:
        return num(self.payload, "think_ms")


def graded_turns(events: list[Event]) -> list[GradedTurn]:
    turns: dict[int, dict] = {}
    for e in sorted(events, key=lambda e: e.ts):
        turn_no = e.payload.get("turn_no")
        if not isinstance(turn_no, int):
            continue
        if e.type == "turn":
            turns[turn_no] = {**e.payload, **{k: v for k, v in turns.get(turn_no, {}).items() if v is not None}}
        elif e.type == "turn_graded":
            graded = {k: v for k, v in e.payload.items() if v is not None}
            turns[turn_no] = {**turns.get(turn_no, {"turn_no": turn_no}), **graded}
    return [GradedTurn(n, turns[n]) for n in sorted(turns)]


def fast_and_wrong_runs(turns: list[GradedTurn], max_ms: float, max_quality: float, min_len: int = 3) -> list[list[GradedTurn]]:
    runs, current = [], []
    for t in turns:
        if t.think_ms is not None and t.quality is not None and t.think_ms < max_ms and t.quality < max_quality:
            current.append(t)
        else:
            if len(current) >= min_len:
                runs.append(current)
            current = []
    if len(current) >= min_len:
        runs.append(current)
    return runs

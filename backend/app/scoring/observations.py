"""Turn stored events into 0-100 observations, one per dimension per round or mini-game.

Mini-game observations (noise r = 12) come from each `minigame_end` and the `trial`
events before it. In-game observations (noise r = 25, noisier because of luck and
because a round mixes every skill) come from a whole round once its `round_end` is
stored; the reasoning one improves as `turn_graded` events arrive.

The reference values below are placeholders from the task pack, to be tuned on pilot
data (docs/scoring.md says so). Pure functions, no database.
"""

import statistics
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from app.schemas import DIMENSIONS

R_MINIGAME = 12.0
R_ROUND = 25.0
QUICK_MATCH_SECONDS = 45

MINIGAME_DIMENSION = {
    "card_recall": "memory",
    "meld_spotter": "attention",
    "quick_match": "speed",
    "rami_puzzle": "reasoning",
    "rule_switch": "flexibility",
}


class EventLike(Protocol):
    event_id: str
    session_id: str
    round_id: str | None
    ts: datetime
    type: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class Observation:
    dimension: str
    value: float  # 0-100
    noise: float  # r, standard deviation of the measurement
    ts: datetime
    kind: str  # "minigame" | "round"
    ref: str  # minigame_end event id, or round id
    session_id: str

    @property
    def source_key(self) -> str:
        return f"{self.kind}:{self.ref}:{self.dimension}"


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return min(max(value, low), high)


def num(mapping: Any, key: str) -> float | None:
    """A numeric field, or None if missing or not a number (booleans excluded)."""
    if not isinstance(mapping, dict):
        return None
    value = mapping.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _extras(trials: Sequence[EventLike], key: str) -> list[float]:
    values = (num(t.payload.get("extra"), key) for t in trials)
    return [v for v in values if v is not None]


# ---------- mini-games ----------
def _card_recall(end: dict, trials: Sequence[EventLike]) -> float | None:
    """(span reached - 2) / 7 x 100. Span = longest correctly recalled sequence."""
    spans = [
        num(t.payload.get("extra"), "span") or num(t.payload, "level")
        for t in trials
        if t.payload.get("correct") is True
    ]
    spans = [s for s in spans if s is not None]
    span = max(spans) if spans else num(end, "score_raw") or num(end, "level_end")
    if span is None:
        return None
    return (span - 2) / 7 * 100


def _meld_spotter(end: dict, trials: Sequence[EventLike]) -> float | None:
    """(hit rate - false-alarm rate) x 100 + 5 x level.

    Uses trial extras {hits, targets, false_alarms, decoys} when the game sends them,
    else accuracy as the hit rate and no false alarms.
    """
    level = num(end, "level_end") or 0.0
    targets, decoys = sum(_extras(trials, "targets")), sum(_extras(trials, "decoys"))
    if targets > 0:
        hit_rate = sum(_extras(trials, "hits")) / targets
        false_alarm_rate = sum(_extras(trials, "false_alarms")) / decoys if decoys > 0 else 0.0
    else:
        accuracy = num(end, "accuracy")
        if accuracy is None:
            return None
        hit_rate, false_alarm_rate = accuracy, 0.0
    return (hit_rate - false_alarm_rate) * 100 + 5 * level


def _quick_match(end: dict, trials: Sequence[EventLike]) -> float | None:
    """Correct answers per minute / 40 x 100."""
    if trials:
        correct = sum(1 for t in trials if t.payload.get("correct") is True)
    else:
        accuracy, n_trials = num(end, "accuracy"), num(end, "n_trials")
        if accuracy is None or n_trials is None:
            return None
        correct = accuracy * n_trials
    duration_ms = num(end, "duration_ms") or QUICK_MATCH_SECONDS * 1000
    per_minute = correct / (duration_ms / 60_000)
    return per_minute / 40 * 100


def _rami_puzzle(end: dict, trials: Sequence[EventLike]) -> float | None:
    """accuracy x 60 + level x 4."""
    accuracy, level = num(end, "accuracy"), num(end, "level_end")
    if accuracy is None or level is None:
        return None
    return accuracy * 60 + level * 4


def _rule_switch(end: dict, trials: Sequence[EventLike]) -> float | None:
    """100 - 12 x mean trials needed to adapt after a hidden rule change."""
    adapt = _extras(trials, "trials_to_adapt")
    if not adapt:
        value = num(end.get("extra"), "trials_to_adapt") if isinstance(end.get("extra"), dict) else None
        adapt = [value] if value is not None else []
    if not adapt:
        return None
    return 100 - 12 * statistics.fmean(adapt)


def _generic(end: dict, trials: Sequence[EventLike]) -> float | None:
    """A mini-game added later (e.g. for a new dimension): accuracy x 100."""
    accuracy = num(end, "accuracy")
    return None if accuracy is None else accuracy * 100


MINIGAME_SCORERS: dict[str, Callable[[dict, Sequence[EventLike]], float | None]] = {
    "card_recall": _card_recall,
    "meld_spotter": _meld_spotter,
    "quick_match": _quick_match,
    "rami_puzzle": _rami_puzzle,
    "rule_switch": _rule_switch,
}


def minigame_observation(end: EventLike, trials: Sequence[EventLike]) -> Observation | None:
    """Score one finished mini-game from its `minigame_end` and its `trial` events."""
    game = end.payload.get("game")
    dimension = MINIGAME_DIMENSION.get(game) or end.payload.get("dimension")
    if dimension not in DIMENSIONS:
        return None
    value = MINIGAME_SCORERS.get(game, _generic)(end.payload, trials)
    if value is None:
        return None
    return Observation(dimension, clamp(value), R_MINIGAME, end.ts, "minigame", end.event_id, end.session_id)


def session_minigame_observations(events: Iterable[EventLike]) -> list[Observation]:
    """All mini-game observations of one session. Each `minigame_end` takes the trials
    of the same game logged since the previous end of that game."""
    pending: dict[Any, list[EventLike]] = {}
    observations = []
    for event in sorted(events, key=lambda e: e.ts):
        game = event.payload.get("game")
        if event.type == "trial":
            pending.setdefault(game, []).append(event)
        elif event.type == "minigame_end":
            obs = minigame_observation(event, pending.pop(game, []))
            if obs is not None:
                observations.append(obs)
    return observations


# ---------- Rami rounds ----------
def round_observations(events: Iterable[EventLike]) -> list[Observation]:
    """In-game observations of one round. Empty until its `round_end` is stored."""
    events = sorted(events, key=lambda e: e.ts)
    end = next((e for e in events if e.type == "round_end"), None)
    if end is None or end.round_id is None:
        return []

    turns = [e.payload for e in events if e.type == "turn"]
    values: dict[str, float | None] = {
        "memory": _round_memory(events, turns),
        "attention": _round_attention(turns),
        "speed": _round_speed(turns),
        "reasoning": _round_reasoning(events, turns),
        "flexibility": _round_flexibility(events),
    }
    return [
        Observation(dimension, clamp(value), R_ROUND, end.ts, "round", end.round_id, end.session_id)
        for dimension, value in values.items()
        if value is not None
    ]


def _round_memory(events: Sequence[EventLike], turns: list[dict]) -> float | None:
    """Recall-probe accuracy x 100, minus 10 per discard that fed the opponent."""
    probes = [e.payload.get("correct") is True for e in events if e.type == "recall_probe"]
    if not probes:
        return None
    fed = sum(1 for t in turns if t.get("fed_opponent") is True)
    return statistics.fmean(probes) * 100 - 10 * fed


def _round_attention(turns: list[dict]) -> float | None:
    """100 x (1 - missed / (missed + used)) over lay-offs, joker swaps and melds."""
    used = missed = 0.0
    for turn in turns:
        laid_down = turn.get("laid_down")
        used += (num(turn, "laid_off") or 0) + (num(turn, "joker_swaps") or 0)
        used += len(laid_down) if isinstance(laid_down, list) else 0
        missed_counts = turn.get("missed")
        for key in ("lay_offs", "joker_swaps", "melds_in_hand"):
            missed += num(missed_counts, key) or 0
    if used + missed == 0:
        return None
    return 100 * (1 - missed / (missed + used))


def _round_speed(turns: list[dict]) -> float | None:
    """100 x clamp(1 - (median think time per option - 300 ms) / 1500)."""
    per_option = []
    for turn in turns:
        think_ms, options = num(turn, "think_ms"), num(turn, "options_count")
        if think_ms is not None and options:
            per_option.append(think_ms / options)
    if not per_option:
        return None
    return 100 * clamp(1 - (statistics.median(per_option) - 300) / 1500, 0.0, 1.0)


def _round_reasoning(events: Sequence[EventLike], turns: list[dict]) -> float | None:
    """Mean decision quality x 100. A `turn_graded` result replaces the turn's own value."""
    quality: dict[Any, float] = {}
    for turn in turns:
        q = num(turn, "quality")
        if q is not None:
            quality[turn.get("turn_no")] = q
    for event in events:
        if event.type == "turn_graded":
            q = num(event.payload, "quality")
            if q is not None:
                quality[event.payload.get("turn_no")] = q
    if not quality:
        return None
    return statistics.fmean(quality.values()) * 100


def _round_flexibility(events: Sequence[EventLike]) -> float | None:
    """100 - 20 x mean turns a stale plan was kept before switching."""
    waited = [num(e.payload, "turns_waited") for e in events if e.type == "plan_switch"]
    waited = [w for w in waited if w is not None]
    if not waited:
        return None
    return 100 - 20 * statistics.fmean(waited)

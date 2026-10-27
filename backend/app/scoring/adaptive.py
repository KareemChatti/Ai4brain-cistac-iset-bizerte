"""Today's plan: what to train next and at which level.

- Focus: the dimension with the highest need = (100 - mu) + 0.5 x (high - low), so both
  weak and uncertain skills get trained.
- Steps: a mini-game for the focus, a Rami round, a mini-game for the most uncertain other
  dimension, then the focus mini-game again.
- Mini-game level: where the user ended that game last time (1 for a new game).
- Opponent level (1-5): starts at 2, +1 after 2 wins in a row, -1 after 2 losses in a row,
  and -1 for the next round when a break was suggested.
- Quick round when the user's last 3 sessions were each shorter than 10 minutes (and for new users).
"""

from datetime import timedelta

from sqlmodel import Session

from app.schemas import DIMENSIONS, Plan, PlanStep
from app.scoring.frustration import suggest_break
from app.scoring.history import recent_session_ids, user_events
from app.scoring.observations import MINIGAME_DIMENSION, num
from app.scoring.profile import build_profile
from app.scoring.rounds import finished_rounds

GAME_FOR = {dimension: game for game, dimension in MINIGAME_DIMENSION.items()}
LABEL = {"memory": "Memory", "attention": "Attention", "speed": "Speed", "reasoning": "Reasoning", "flexibility": "Flexibility"}
START_LEVEL = 2
MIN_LEVEL, MAX_LEVEL = 1, 5
SHORT_SESSION = timedelta(minutes=10)


def need(estimate) -> float:
    return (100 - estimate.score) + 0.5 * (estimate.high - estimate.low)


def opponent_level(results: list[bool]) -> int:
    """Replay win/loss results (True = win) through the 2-in-a-row rule."""
    level, streak_wins, streak_losses = START_LEVEL, 0, 0
    for won in results:
        streak_wins, streak_losses = (streak_wins + 1, 0) if won else (0, streak_losses + 1)
        if streak_wins == 2:
            level, streak_wins = min(level + 1, MAX_LEVEL), 0
        elif streak_losses == 2:
            level, streak_losses = max(level - 1, MIN_LEVEL), 0
    return level


def minigame_levels(session: Session, user_id: str) -> dict[str, int]:
    levels: dict[str, int] = {}
    for e in user_events(session, user_id, "minigame_end"):
        level = num(e.payload, "level_end")
        if level is not None and e.payload.get("game"):
            levels[e.payload["game"]] = int(level)
    return levels


def quick_mode(session: Session, user_id: str) -> bool:
    sessions = recent_session_ids(session, user_id, 3)
    if len(sessions) < 3:
        return True
    events = user_events(session, user_id)
    for sid in sessions:
        ts = [e.ts for e in events if e.session_id == sid]
        if max(ts) - min(ts) >= SHORT_SESSION:
            return False
    return True


def next_plan(session: Session, user_id: str) -> Plan:
    dims = build_profile(session, user_id).dimensions
    focus = max(DIMENSIONS, key=lambda d: (need(dims[d]), -DIMENSIONS.index(d)))
    others = [d for d in DIMENSIONS if d != focus]
    second = max(others, key=lambda d: (dims[d].high - dims[d].low, -DIMENSIONS.index(d)))

    level = opponent_level([r.won for r in finished_rounds(session, user_id) if not r.abandoned])
    if suggest_break(session, user_id):
        level = max(level - 1, MIN_LEVEL)

    levels = minigame_levels(session, user_id)

    def game_step(dimension: str) -> PlanStep:
        game = GAME_FOR[dimension]
        return PlanStep(kind="minigame", game=game, level=levels.get(game, 1))

    e = dims[focus]
    lowest = min(DIMENSIONS, key=lambda d: dims[d].score)
    if e.n_obs == 0:
        reason = f"We don't know much about your {focus} yet, so today starts there."
    elif focus == lowest:
        wide = " and its range is still wide" if e.high - e.low > 20 else ""
        reason = f"{LABEL[focus]} has the lowest score ({round(e.score)}){wide}."
    else:
        reason = (f"{LABEL[focus]} has the most room to grow: score {round(e.score)}, "
                  f"range {round(e.low)}-{round(e.high)}.")

    return Plan(
        focus=focus,
        reason=reason,
        opponent_level=level,
        quick_mode=quick_mode(session, user_id),
        steps=[game_step(focus), PlanStep(kind="rami"), game_step(second), game_step(focus)],
    )

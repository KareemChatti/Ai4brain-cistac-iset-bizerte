"""Today's plan: what to train next and at which level.

- Focus: the dimension with the highest need = (100 - mu) + 0.5 x (high - low), so both
  weak and uncertain skills get trained.
- Steps: Rami rounds only (the mini-games were removed): one round, and the reason says
  which skill the round should focus on.
- Opponent level (1-5): starts at 2, +1 after 2 wins in a row, -1 after 2 losses in a row,
  and -1 for the next round when a break was suggested.
- Quick round when the user's last 3 sessions were each shorter than 10 minutes (and for new users).
"""

from datetime import timedelta

from sqlmodel import Session

from app.schemas import DIMENSIONS, Plan, PlanStep
from app.scoring.frustration import suggest_break
from app.scoring.history import recent_session_ids, user_events
from app.scoring.profile import build_profile
from app.scoring.rounds import finished_rounds

# What to watch in the round to train each skill.
IN_THE_ROUND = {
    "memory": "In this round, keep track of the cards your opponent picks up and discards.",
    "attention": "In this round, look for lay-offs and joker swaps before every discard.",
    "speed": "In this round, try to decide each turn a little faster without rushing your discard.",
    "reasoning": "In this round, think about which discard gets you out fastest.",
    "flexibility": "In this round, be ready to switch between runs and sets when the cards change.",
}
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

    level = opponent_level([r.won for r in finished_rounds(session, user_id) if not r.abandoned])
    if suggest_break(session, user_id):
        level = max(level - 1, MIN_LEVEL)

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
    reason = f"{reason} {IN_THE_ROUND[focus]}"

    return Plan(
        focus=focus,
        reason=reason,
        opponent_level=level,
        quick_mode=quick_mode(session, user_id),
        steps=[PlanStep(kind="rami")],
    )

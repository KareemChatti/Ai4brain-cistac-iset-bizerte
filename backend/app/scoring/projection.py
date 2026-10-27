"""What-if projection: where each score could be after more sessions at the user's own pace.

Gain per session = least-squares slope of the user's mean after each of their last 10
sessions, clamped to [0, 2] points. With fewer than 3 sessions the gain is 0.
For week w: score = mu + gain x sessions_per_week x w, half-width = 1.96 sigma + 3 w.
"""

from datetime import datetime

from sqlmodel import Session

from app.schemas import DIMENSIONS, Projection, ProjectionPoint
from app.scoring.pipeline import load_observations
from app.scoring.twin import Z95, Twin, _clip, _ordered
from app.timeutil import to_utc, utcnow

DISCLAIMER = "Estimate based on your own past progress. Not a prediction of ability."
MAX_GAIN = 2.0
SESSIONS_WINDOW = 10
MIN_SESSIONS = 3
WIDEN_PER_WEEK = 3.0


def slope(ys: list[float]) -> float:
    """Least-squares slope of ys against 0, 1, 2, ..."""
    n = len(ys)
    if n < 2:
        return 0.0
    mean_x, mean_y = (n - 1) / 2, sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in enumerate(ys))
    den = sum((x - mean_x) ** 2 for x in range(n))
    return num / den


def session_means(observations) -> dict[str, list[float]]:
    """Per dimension, the mean after each session that observed it, in time order."""
    twin = Twin()
    means: dict[str, list[float]] = {d: [] for d in DIMENSIONS}
    ordered = _ordered(observations)
    for i, obs in enumerate(ordered):
        twin.apply(obs)
        nxt = ordered[i + 1] if i + 1 < len(ordered) else None
        if nxt is None or nxt.session_id != obs.session_id:
            for d in {o.dimension for o in ordered[: i + 1] if o.session_id == obs.session_id}:
                means[d].append(twin.beliefs[d].mu)
    return means


def gain_per_session(means: list[float]) -> float:
    recent = means[-SESSIONS_WINDOW:]
    if len(recent) < MIN_SESSIONS:
        return 0.0
    return min(max(slope(recent), 0.0), MAX_GAIN)


def project(
    session: Session, user_id: str, sessions_per_week: int, weeks: int, now: datetime | None = None
) -> Projection:
    observations = load_observations(session, user_id)
    twin = Twin()
    for obs in _ordered(observations):
        twin.apply(obs)
    now = to_utc(now or utcnow())
    means = session_means(observations)

    points = []
    for d in DIMENSIONS:
        belief = twin.beliefs[d].at(now)
        gain = gain_per_session(means[d])
        for w in range(weeks + 1):
            mu = belief.mu + gain * sessions_per_week * w
            half = Z95 * belief.sigma + WIDEN_PER_WEEK * w
            points.append(ProjectionPoint(
                week=w, dimension=d, score=round(_clip(mu), 1),
                low=round(_clip(mu - half), 1), high=round(_clip(mu + half), 1),
            ))
    return Projection(sessions_per_week=sessions_per_week, weeks=weeks, points=points, disclaimer=DISCLAIMER)

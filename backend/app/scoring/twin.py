"""The Brain Twin: one uncertainty-aware belief per dimension, updated with a Kalman filter.

Each dimension's true score is believed to be Normal(mu, sigma^2) on a 0-100 scale.
- Start: mu = 50, sigma = 25 (we know nothing yet).
- Drift: before each update, var += q^2 * days since the last update (q = 2), so the
  twin can follow real change; the displayed range also widens while the user is away.
- Update with an observation x of noise r: K = var / (var + r^2), mu += K (x - mu), var *= (1 - K).
- Displayed range: mu +/- 1.96 sigma, clipped to 0-100 (a 95% range).

Pure Python, no database: `replay()` turns a list of observations into a Twin.
Full explanation in docs/scoring.md.
"""

import math
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta

from app.schemas import DIMENSIONS
from app.scoring.observations import Observation

PRIOR_MU = 50.0
PRIOR_SIGMA = 25.0
DRIFT_Q = 2.0  # points of standard deviation per sqrt(day)
Z95 = 1.96
TREND_WINDOW = timedelta(days=7)


def _days(start: datetime, end: datetime) -> float:
    return max((end - start).total_seconds(), 0.0) / 86400


def _clip(value: float) -> float:
    return min(max(value, 0.0), 100.0)


@dataclass
class DimensionBelief:
    mu: float = PRIOR_MU
    sigma: float = PRIOR_SIGMA
    n_obs: int = 0
    last_ts: datetime | None = None

    @property
    def var(self) -> float:
        return self.sigma**2

    def drift(self, days: float, q: float = DRIFT_Q) -> None:
        self.sigma = math.sqrt(self.var + q**2 * max(days, 0.0))

    def update(self, x: float, r: float) -> None:
        gain = self.var / (self.var + r**2)
        self.mu += gain * (x - self.mu)
        self.sigma = math.sqrt((1 - gain) * self.var)
        self.n_obs += 1

    def observe(self, x: float, r: float, ts: datetime) -> None:
        """Drift since the last observation of this dimension, then update."""
        if self.last_ts is not None:
            self.drift(_days(self.last_ts, ts))
        self.update(x, r)
        self.last_ts = ts

    def at(self, ts: datetime) -> "DimensionBelief":
        """The belief as it stands at `ts` (drift applied), without changing this one."""
        belief = replace(self)
        if belief.last_ts is not None:
            belief.drift(_days(belief.last_ts, ts))
        return belief

    @property
    def low(self) -> float:
        return _clip(self.mu - Z95 * self.sigma)

    @property
    def high(self) -> float:
        return _clip(self.mu + Z95 * self.sigma)


@dataclass
class Twin:
    beliefs: dict[str, DimensionBelief] = field(
        default_factory=lambda: {d: DimensionBelief() for d in DIMENSIONS}
    )
    mu_history: dict[str, list[tuple[datetime, float]]] = field(
        default_factory=lambda: {d: [] for d in DIMENSIONS}
    )

    def apply(self, obs: Observation) -> None:
        belief = self.beliefs[obs.dimension]
        belief.observe(obs.value, obs.noise, obs.ts)
        self.mu_history[obs.dimension].append((obs.ts, belief.mu))

    def trend(self, dimension: str, at: datetime) -> float:
        """Change of the mean over the last 7 days. 0 until there is a week of history."""
        cutoff = at - TREND_WINDOW
        before = [mu for ts, mu in self.mu_history[dimension] if ts <= cutoff]
        if not before:
            return 0.0
        return self.beliefs[dimension].mu - before[-1]

    def estimate(self, dimension: str, at: datetime) -> dict[str, float | int]:
        belief = self.beliefs[dimension].at(at)
        return {
            "score": round(belief.mu, 1),
            "low": round(belief.low, 1),
            "high": round(belief.high, 1),
            "n_obs": belief.n_obs,
            "trend": round(self.trend(dimension, at), 1),
        }

    def estimates(self, at: datetime) -> dict[str, dict[str, float | int]]:
        return {d: self.estimate(d, at) for d in DIMENSIONS}


def _ordered(observations: Iterable[Observation]) -> list[Observation]:
    return sorted(observations, key=lambda o: (o.ts, o.source_key))


def replay(observations: Iterable[Observation]) -> Twin:
    """Apply every observation in time order, starting from the prior."""
    twin = Twin()
    for obs in _ordered(observations):
        twin.apply(obs)
    return twin


@dataclass(frozen=True)
class SnapshotPoint:
    ts: datetime
    trigger: str  # "round" | "minigame"
    dimensions: dict[str, dict[str, float | int]]


def replay_with_snapshots(observations: Iterable[Observation]) -> tuple[Twin, list[SnapshotPoint]]:
    """Replay, recording the whole profile after each round or mini-game."""
    twin = Twin()
    points: list[SnapshotPoint] = []
    ordered = _ordered(observations)
    for i, obs in enumerate(ordered):
        twin.apply(obs)
        is_last_of_group = i + 1 == len(ordered) or (ordered[i + 1].kind, ordered[i + 1].ref) != (obs.kind, obs.ref)
        if is_last_of_group:
            points.append(SnapshotPoint(obs.ts, obs.kind, twin.estimates(obs.ts)))
    return twin, points

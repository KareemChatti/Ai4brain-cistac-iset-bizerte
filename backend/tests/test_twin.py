import math
from datetime import UTC, datetime, timedelta

import pytest

from app.scoring.observations import Observation
from app.scoring.twin import DimensionBelief, replay, replay_with_snapshots

T0 = datetime(2026, 10, 1, 18, 0, tzinfo=UTC)


def obs(value, dimension="memory", r=12.0, ts=T0, kind="minigame", ref=None):
    return Observation(dimension, value, r, ts, kind, ref or f"ref-{value}-{ts.isoformat()}", "s1")


def test_prior_is_50_with_range_1_to_99():
    belief = DimensionBelief()

    assert belief.mu == 50
    assert round(belief.low) == 1
    assert round(belief.high) == 99


def test_update_follows_the_kalman_formula():
    belief = DimensionBelief()
    belief.update(80, r=12)

    gain = 625 / (625 + 144)
    assert belief.mu == pytest.approx(50 + gain * 30)
    assert belief.sigma == pytest.approx(math.sqrt((1 - gain) * 625))
    assert belief.n_obs == 1


def test_noisy_observation_moves_the_mean_less():
    precise, noisy = DimensionBelief(), DimensionBelief()
    precise.update(80, r=12)
    noisy.update(80, r=25)

    assert precise.mu > noisy.mu > 50


def test_ten_observations_of_80_converge():
    twin = replay([obs(80, ref=f"g{i}") for i in range(10)])
    estimate = twin.estimate("memory", T0)

    assert estimate["score"] > 75
    assert (estimate["high"] - estimate["low"]) / 2 < 10
    assert estimate["n_obs"] == 10


def test_range_shrinks_with_every_observation():
    widths = []
    for n in range(1, 6):
        estimate = replay([obs(70, ref=f"g{i}") for i in range(n)]).estimate("memory", T0)
        widths.append(estimate["high"] - estimate["low"])

    assert widths == sorted(widths, reverse=True)


def test_drift_adds_q_squared_per_day():
    belief = DimensionBelief(mu=60, sigma=5)
    belief.drift(days=4)

    assert belief.var == pytest.approx(25 + 4 * 4)
    assert belief.mu == 60


def test_range_widens_while_the_user_is_away():
    twin = replay([obs(70, ref=f"g{i}") for i in range(5)])
    today = twin.estimate("memory", T0)
    in_a_month = twin.estimate("memory", T0 + timedelta(days=30))

    assert in_a_month["score"] == today["score"]
    assert in_a_month["high"] - in_a_month["low"] > today["high"] - today["low"]


def test_range_is_clipped_to_0_100():
    estimate = replay([obs(100, ref=f"g{i}") for i in range(3)]).estimate("memory", T0)

    assert estimate["high"] == 100.0
    assert 0 <= estimate["low"] <= estimate["score"] <= 100


def test_dimensions_are_independent():
    estimates = replay([obs(90, "speed")]).estimates(T0)

    assert estimates["speed"]["score"] > 50
    assert estimates["memory"] == {"score": 50.0, "low": 1.0, "high": 99.0, "n_obs": 0, "trend": 0.0}


def test_replay_order_is_by_time_not_by_list_order():
    a = obs(90, ts=T0, ref="a")
    b = obs(30, ts=T0 + timedelta(days=1), ref="b")

    assert replay([a, b]).estimate("memory", T0)["score"] == replay([b, a]).estimate("memory", T0)["score"]


def test_trend_compares_with_seven_days_ago():
    history = [obs(50, ts=T0 - timedelta(days=10), ref="old"), obs(90, ts=T0, ref="new")]
    twin = replay(history)

    old_mu = replay(history[:1]).beliefs["memory"].mu
    assert twin.estimate("memory", T0)["trend"] == round(twin.beliefs["memory"].mu - old_mu, 1)
    assert twin.estimate("memory", T0)["trend"] > 0


def test_trend_is_zero_without_a_week_of_history():
    assert replay([obs(90)]).estimate("memory", T0)["trend"] == 0.0


def test_one_snapshot_per_round_or_minigame():
    round_obs = [obs(v, d, r=25, ts=T0, kind="round", ref="round-1") for v, d in [(60, "memory"), (70, "speed")]]
    game_obs = obs(80, ts=T0 + timedelta(hours=1), ref="game-1")

    _, points = replay_with_snapshots([*round_obs, game_obs])

    assert [p.trigger for p in points] == ["round", "minigame"]
    assert points[0].dimensions["speed"]["n_obs"] == 1
    assert points[1].dimensions["memory"]["n_obs"] == 2

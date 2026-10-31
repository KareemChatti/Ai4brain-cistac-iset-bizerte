import uuid
from datetime import UTC, datetime, timedelta

from app.models import Observation, Snapshot
from app.schemas import DIMENSIONS, Profile, SnapshotOut
from app.scoring.profile import get_profile, recent_round_ids
from tests.conftest import FIXTURE_ROUND, FIXTURE_USER, count_rows, make_event


def profile(client, user_id=FIXTURE_USER):
    return client.get(f"/api/profile/{user_id}").json()


def minigame(user_id, value_span, ts, session_id=None):
    session_id = session_id or str(uuid.uuid4())
    common = {"user_id": user_id, "session_id": session_id, "source": "minigame"}
    return [
        make_event(**common, ts=ts, type="trial",
                   payload={"game": "card_recall", "dimension": "memory", "level": value_span, "correct": True,
                            "rt_ms": 4000, "extra": {"span": value_span}}),
        make_event(**common, ts=ts, type="minigame_end",
                   payload={"game": "card_recall", "dimension": "memory", "level_start": 4,
                            "level_end": value_span, "n_trials": 1, "accuracy": 1.0, "score_raw": value_span}),
    ]


def test_new_user_profile_is_the_prior(client):
    user_id = client.post("/api/users", json={"nickname": "Hey"}).json()["user_id"]

    body = profile(client, user_id)

    Profile.model_validate(body)
    for dimension in DIMENSIONS:
        assert body["dimensions"][dimension] == {"score": 50.0, "low": 1.0, "high": 99.0, "n_obs": 0, "trend": 0.0}
    assert body["n_rounds"] == body["n_minigames"] == 0
    assert body["flags"] == {"suggest_break": False}


def test_fixture_batch_produces_a_profile(client, batch):
    client.post("/api/events", json=batch)

    body = profile(client)

    Profile.model_validate(body)
    assert body["dimensions"]["memory"]["n_obs"] > 0
    assert all(body["dimensions"][d]["n_obs"] > 0 for d in DIMENSIONS)
    assert body["n_rounds"] == 1
    assert body["n_minigames"] == 1


def test_scores_stay_inside_their_range(client, batch):
    client.post("/api/events", json=batch)

    for estimate in profile(client)["dimensions"].values():
        assert 0 <= estimate["low"] <= estimate["score"] <= estimate["high"] <= 100


def test_posting_twice_does_not_count_twice(client, batch):
    client.post("/api/events", json=batch)
    first = profile(client)["dimensions"]
    client.post("/api/events", json=batch)

    assert profile(client)["dimensions"] == first
    assert count_rows(Observation.__table__) == 6


def test_range_shrinks_as_more_games_arrive(client):
    user_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    widths = []
    for i in range(5):
        ts = (now - timedelta(minutes=10 - i)).isoformat().replace("+00:00", "Z")
        client.post("/api/events", json={"events": minigame(user_id, 7, ts)})
        memory = profile(client, user_id)["dimensions"]["memory"]
        widths.append(memory["high"] - memory["low"])

    assert widths == sorted(widths, reverse=True)
    assert profile(client, user_id)["dimensions"]["memory"]["n_obs"] == 5


def test_late_turn_graded_updates_reasoning(client, batch):
    events = batch["events"]
    graded = [e for e in events if e["type"] == "turn_graded"]
    client.post("/api/events", json={"events": [e for e in events if e["type"] != "turn_graded"]})
    before = profile(client)["dimensions"]["reasoning"]

    client.post("/api/events", json={"events": graded})
    after = profile(client)["dimensions"]["reasoning"]

    assert before["n_obs"] == 0
    assert after["n_obs"] == 1
    assert after["score"] < 50


def test_history_has_one_snapshot_per_game_and_round(client, batch):
    client.post("/api/events", json=batch)

    history = client.get(f"/api/profile/{FIXTURE_USER}/history").json()

    for snapshot in history:
        SnapshotOut.model_validate(snapshot)
    assert [s["trigger"] for s in history] == ["minigame", "round"]
    assert [s["ts"] for s in history] == ["2026-10-19T18:30:18Z", "2026-10-19T18:31:10Z"]
    assert history[0]["dimensions"]["memory"]["n_obs"] == 1
    assert history[1]["dimensions"]["memory"]["n_obs"] == 2


def test_history_is_rebuilt_not_duplicated(client, batch):
    client.post("/api/events", json=batch)
    client.post("/api/events", json={"events": [make_event(type="goal_set")]})
    client.post("/api/events", json={"events": batch["events"][-3:]})

    assert count_rows(Snapshot.__table__) == 2


def test_coach_events_alone_do_not_rescore(client, batch, monkeypatch):
    from app.scoring import pipeline

    client.post("/api/events", json=batch)
    calls = []
    monkeypatch.setattr(pipeline, "rebuild_snapshots", lambda *a: calls.append(a))

    client.post("/api/events", json={"events": [make_event(source="coach", type="hint_why", payload={"hint_id": "h9"})]})

    assert calls == []


def test_delete_removes_the_twin(client, batch):
    client.post("/api/events", json=batch)
    client.delete(f"/api/data/{FIXTURE_USER}")

    assert count_rows(Observation.__table__) == 0
    assert count_rows(Snapshot.__table__) == 0
    assert client.get(f"/api/profile/{FIXTURE_USER}").status_code == 404


def test_profile_of_unknown_user_is_404(client):
    assert client.get(f"/api/profile/{uuid.uuid4()}").status_code == 404
    assert client.get(f"/api/profile/{uuid.uuid4()}/history").status_code == 404


def test_functions_for_the_coach(client, batch):
    client.post("/api/events", json=batch)

    assert get_profile(FIXTURE_USER).dimensions["memory"].n_obs == 2
    assert recent_round_ids(FIXTURE_USER) == [FIXTURE_ROUND]
    assert recent_round_ids(str(uuid.uuid4())) == []

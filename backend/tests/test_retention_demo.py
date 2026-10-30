"""The 90-day / 180-day retention job and the simulated demo players."""

import uuid
from datetime import timedelta

from sqlmodel import Session

from app import db
from app.demo import DEMO_PLAYERS, build_demo_events, seed_demo
from app.models import Event, Observation, Snapshot, User
from app.retention import run_retention
from app.timeutil import utcnow
from tests.conftest import FIXTURE_USER, count_rows, make_event


def iso(dt) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def retention(now=None):
    with Session(db.get_engine()) as session:
        return run_retention(session, now)


def set_last_active(user_id: str, when) -> None:
    with Session(db.get_engine()) as session:
        user = session.get(User, user_id)
        user.last_active_at = when
        session.add(user)
        session.commit()


# ---------------- retention ----------------
def test_events_older_than_90_days_are_deleted(client):
    now = utcnow()
    old = make_event(ts=iso(now - timedelta(days=91)))
    recent = make_event(ts=iso(now - timedelta(days=10)))
    client.post("/api/events", json={"events": [old, recent]})

    result = retention(now)

    assert result == {"events": 1, "users": 0}
    assert count_rows(Event.__table__) == 1


def test_derived_scores_survive_event_cleanup(client, batch):
    client.post("/api/events", json={"events": batch["events"]})  # fixture dated Oct 19
    before = client.get(f"/api/profile/{FIXTURE_USER}").json()["dimensions"]

    retention(utcnow() + timedelta(days=200 - 180 + 90))  # far enough for the events, user still active

    assert count_rows(Event.__table__) == 0
    assert count_rows(Observation.__table__) > 0
    assert count_rows(Snapshot.__table__) > 0
    after = client.get(f"/api/profile/{FIXTURE_USER}").json()["dimensions"]
    assert {d: v["n_obs"] for d, v in after.items()} == {d: v["n_obs"] for d, v in before.items()}


def test_users_inactive_for_180_days_are_deleted_with_everything(client, batch):
    client.post("/api/events", json={"events": batch["events"]})
    set_last_active(FIXTURE_USER, utcnow() - timedelta(days=181))
    keep = str(uuid.uuid4())
    client.post("/api/events", json={"events": [make_event(keep, ts=iso(utcnow()))]})

    result = retention()

    assert result["users"] == 1
    assert count_rows(User.__table__, user_id=FIXTURE_USER) == 0
    assert count_rows(Observation.__table__, user_id=FIXTURE_USER) == 0
    assert count_rows(User.__table__, user_id=keep) == 1
    # Late events of the removed user are dropped, like after "delete my data".
    client.post("/api/events", json={"events": [make_event(ts=iso(utcnow()))]})
    assert count_rows(User.__table__, user_id=FIXTURE_USER) == 0


def test_retention_is_idempotent(client):
    client.post("/api/events", json={"events": [make_event(ts=iso(utcnow() - timedelta(days=120)))]})
    assert retention()["events"] == 1
    assert retention() == {"events": 0, "users": 0}


# ---------------- demo players ----------------
def test_demo_events_follow_the_contract():
    from app.schemas import EventBatch

    for player in DEMO_PLAYERS:
        events = build_demo_events(player)
        EventBatch.model_validate({"events": events[:500]})
        types = {e["type"] for e in events}
        assert {"match_start", "round_start", "turn", "round_end", "turn_graded", "recall_probe"} <= types
        assert all(e["user_id"] == player.user_id for e in events)


def test_demo_events_are_deterministic():
    now = utcnow()
    a = build_demo_events(DEMO_PLAYERS[0], now)
    b = build_demo_events(DEMO_PLAYERS[0], now)
    assert [e["event_id"] for e in a] == [e["event_id"] for e in b]


def test_seed_fills_every_dashboard_endpoint(client):
    stored = seed_demo()
    assert set(stored) == {p.nickname for p in DEMO_PLAYERS}
    improver, newcomer = DEMO_PLAYERS

    profile = client.get(f"/api/profile/{improver.user_id}").json()
    assert all(v["n_obs"] >= 5 for v in profile["dimensions"].values())
    assert profile["n_rounds"] >= 20
    assert len(client.get(f"/api/profile/{improver.user_id}/history").json()) >= 20
    matches = client.get(f"/api/matches/{improver.user_id}").json()
    assert any(m["winner"] for m in matches)
    assert client.get(f"/api/collab/{improver.user_id}").json()["total"] is not None
    assert client.get(f"/api/plan/{improver.user_id}").status_code == 200
    assert client.get(f"/api/heatmap/{improver.user_id}").status_code == 200
    # The newcomer shows the "still learning about you" state.
    newcomer_profile = client.get(f"/api/profile/{newcomer.user_id}").json()
    assert any(v["n_obs"] < 5 for v in newcomer_profile["dimensions"].values())


def test_demo_players_are_marked_and_say_simulated(client):
    seed_demo()
    for player in DEMO_PLAYERS:
        user = client.get(f"/api/data/{player.user_id}/export").json()["user"]
        assert user["is_demo"] is True
        assert "simulated" in user["nickname"]


def test_seeding_twice_adds_nothing_and_reset_rebuilds(client):
    first = seed_demo()
    events = count_rows(Event.__table__)
    assert seed_demo() == {}
    assert count_rows(Event.__table__) == events
    assert seed_demo(reset=True) == first
    assert count_rows(Event.__table__) == events


def test_demo_players_are_never_removed_for_inactivity(client):
    seed_demo()
    for player in DEMO_PLAYERS:
        set_last_active(player.user_id, utcnow() - timedelta(days=400))
    retention()
    assert count_rows(User.__table__) == len(DEMO_PLAYERS)

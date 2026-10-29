"""The live session WebSocket, the match history and live alerts in the collab score."""

import uuid

import pytest
from starlette.websockets import WebSocketDisconnect

from app.models import Event
from app.schemas import EventIn
from app.scoring.collab import collab_from_events
from app.scoring.matches import matches_from_events
from app.live import LiveState, live_messages
from tests.conftest import FIXTURE_USER, count_rows, make_event

ROUND = "33333333-3333-4333-8333-333333333333"


def ws(client, user_id=FIXTURE_USER, origin="http://localhost:5173"):
    return client.websocket_connect(f"/ws/session/{user_id}", headers={"origin": origin} if origin else {})


def receive_until(socket, wanted: str, limit: int = 20) -> list[dict]:
    seen = []
    for _ in range(limit):
        msg = socket.receive_json()
        seen.append(msg)
        if msg["type"] == wanted:
            return seen
    raise AssertionError(f"no {wanted!r} in {seen}")


def test_hello_and_ping(client):
    with ws(client) as s:
        assert s.receive_json() == {"type": "hello", "user_id": FIXTURE_USER}
        s.send_json({"type": "ping"})
        assert s.receive_json() == {"type": "pong"}


def test_events_are_stored_and_acknowledged(client, batch):
    with ws(client) as s:
        s.receive_json()
        s.send_json({"type": "events", "events": batch["events"]})
        ack = s.receive_json()
    assert ack["type"] == "ack"
    assert sorted(ack["event_ids"]) == sorted(e["event_id"] for e in batch["events"])
    assert count_rows(Event.__table__) == 18


def test_resending_over_the_socket_stores_once(client, batch):
    with ws(client) as s:
        s.receive_json()
        for _ in range(2):
            s.send_json({"type": "events", "events": batch["events"]})
            receive_until(s, "ack")
    assert count_rows(Event.__table__) == 18


def test_a_finished_round_pushes_a_summary_and_the_profile(client, batch):
    with ws(client) as s:
        s.receive_json()
        s.send_json({"type": "events", "events": batch["events"]})
        messages = receive_until(s, "profile")
    kinds = [m.get("kind") for m in messages if m["type"] == "coach"]
    assert "round_summary" in kinds
    assert "fed_opponent" in kinds  # turn 7 of the fixture fed the opponent
    summary = next(m for m in messages if m.get("kind") == "round_summary")
    assert "Brain Twin" in summary["text"]
    profile = messages[-1]["profile"]
    assert profile["user_id"] == FIXTURE_USER
    assert profile["dimensions"]["memory"]["n_obs"] > 0


def test_invalid_events_get_an_error_and_keep_the_socket_open(client):
    with ws(client) as s:
        s.receive_json()
        s.send_json({"type": "events", "events": [make_event(source="camera")]})
        assert s.receive_json()["type"] == "error"
        s.send_json({"type": "ping"})
        assert s.receive_json() == {"type": "pong"}
    assert count_rows(Event.__table__) == 0


def test_events_of_another_user_are_refused(client):
    other = str(uuid.uuid4())
    with ws(client) as s:
        s.receive_json()
        s.send_json({"type": "events", "events": [make_event(other)]})
        assert "this session's user" in s.receive_json()["message"]
    assert count_rows(Event.__table__) == 0


def test_unknown_message_and_bad_json(client):
    with ws(client) as s:
        s.receive_json()
        s.send_json({"type": "dance"})
        assert s.receive_json()["type"] == "error"
        s.send_text("{not json")
        assert s.receive_json()["type"] == "error"


@pytest.mark.parametrize("path_user, origin", [("not-a-uuid", "http://localhost:5173"), (FIXTURE_USER, "https://evil.example")])
def test_bad_user_or_foreign_origin_is_refused(client, path_user, origin):
    with pytest.raises(WebSocketDisconnect):
        with ws(client, path_user, origin) as s:
            s.receive_json()


def test_no_origin_is_allowed_for_non_browser_clients(client):
    with ws(client, origin=None) as s:
        assert s.receive_json()["type"] == "hello"


# ---------------- coach messages (pure) ----------------
def ev(type_: str, payload: dict, ts: str = "2026-10-29T10:00:00Z", round_id: str | None = ROUND) -> EventIn:
    return EventIn.model_validate(make_event(type=type_, source="rami", payload=payload, ts=ts, round_id=round_id))


def test_three_quick_discards_get_one_pace_message():
    turns = [ev("turn", {"turn_no": i, "think_ms": 900}, ts=f"2026-10-29T10:00:0{i}Z") for i in range(1, 5)]
    msgs = live_messages(LiveState(), turns, None, None)
    assert [m["kind"] for m in msgs] == ["pace"]


def test_a_slow_turn_resets_the_pace_streak():
    times = [900, 900, 4000, 900, 900]
    turns = [ev("turn", {"turn_no": i, "think_ms": t}, ts=f"2026-10-29T10:00:0{i}Z") for i, t in enumerate(times)]
    assert live_messages(LiveState(), turns, None, None) == []


def test_ignoring_the_same_alert_twice_gets_a_nudge():
    alerts = [ev("coach_alert", {"kind": "missed_lay_off", "turn_no": i, "cards": ["5S"], "followed": False},
                 ts=f"2026-10-29T10:00:0{i}Z") for i in range(3)]
    assert [m["kind"] for m in live_messages(LiveState(), alerts, None, None)] == ["alerts_skipped"]


def test_coach_texts_stay_non_clinical():
    from app.coach.guardrails import find_blocked  # the coach's blocked-word list

    events = [
        ev("round_start", {}), ev("turn", {"turn_no": 1, "think_ms": 100, "fed_opponent": True, "discarded": "8H.1"}),
        ev("recall_probe", {"correct": False}), ev("round_end", {"winner": "ai"}),
        ev("match_end", {"winner": "user", "user_total": 120, "ai_total": 410}, round_id=None),
    ]
    for m in live_messages(LiveState(), events, None, None):
        assert not find_blocked(m["text"]), m["text"]


# ---------------- matches ----------------
def match_events(user_id: str) -> list[dict]:
    mid = str(uuid.uuid4())
    r1, r2 = str(uuid.uuid4()), str(uuid.uuid4())
    common = {"user_id": user_id, "source": "rami"}
    return [
        make_event(**common, type="match_start", ts="2026-10-29T10:00:00Z", payload={"match_id": mid, "target": 401}),
        make_event(**common, type="round_start", round_id=r1, ts="2026-10-29T10:00:01Z", payload={"match_id": mid}),
        make_event(**common, type="round_end", round_id=r1, ts="2026-10-29T10:10:00Z",
                   payload={"winner": "user", "user_penalty": 0, "ai_penalty": 230, "abandoned": False}),
        make_event(**common, type="round_start", round_id=r2, ts="2026-10-29T10:11:00Z", payload={"match_id": mid}),
        make_event(**common, type="round_end", round_id=r2, ts="2026-10-29T10:20:00Z",
                   payload={"winner": "user", "user_penalty": 0, "ai_penalty": 180, "abandoned": False}),
        make_event(**common, type="match_end", ts="2026-10-29T10:20:01Z",
                   payload={"match_id": mid, "winner": "user", "user_total": 0, "ai_total": 410, "rounds": 2, "target": 401}),
    ]


def test_match_history_endpoint(client):
    client.post("/api/events", json={"events": match_events(FIXTURE_USER)})

    history = client.get(f"/api/matches/{FIXTURE_USER}").json()

    assert len(history) == 1
    m = history[0]
    assert (m["target"], m["winner"], m["user_total"], m["ai_total"]) == (401, "user", 0, 410)
    assert [r["ai_penalty"] for r in m["rounds"]] == [230, 180]
    assert m["ended_at"].endswith("Z")


def test_a_running_match_has_no_winner_yet():
    events = [EventIn.model_validate(e) for e in match_events(FIXTURE_USER)[:3]]
    (m,) = matches_from_events(events)
    assert m.winner is None and m.ended_at is None and len(m.rounds) == 1


def test_matches_of_unknown_user_is_404(client):
    assert client.get(f"/api/matches/{uuid.uuid4()}").status_code == 404


# ---------------- collab ----------------
def test_followed_live_alerts_count_as_verification():
    alerts = [ev("coach_alert", {"kind": "missed_lay_off", "turn_no": i, "cards": ["5S"], "followed": f})
              for i, f in enumerate([True, True, True, False])]
    score = collab_from_events(alerts)
    assert score.components["verification"].score == 75.0
    assert score.components["verification"].n == 4

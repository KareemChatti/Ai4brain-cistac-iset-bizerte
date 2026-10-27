import json

import pytest

from app.models import Event, User
from app.scoring import pipeline
from tests.conftest import FIXTURE_USER, count_rows, make_event


def test_fixture_batch_is_stored(client, batch):
    response = client.post("/api/events", json=batch)

    assert response.status_code == 200
    assert response.json() == {"accepted": 18}
    assert count_rows(Event.__table__) == 18
    assert count_rows(Event.__table__, user_id=FIXTURE_USER) == 18


def test_posting_twice_stores_once(client, batch):
    first = client.post("/api/events", json=batch)
    second = client.post("/api/events", json=batch)

    assert first.json() == second.json() == {"accepted": 18}
    assert count_rows(Event.__table__) == 18


def test_duplicates_inside_one_batch_are_stored_once(client):
    event = make_event()
    response = client.post("/api/events", json={"events": [event, event, event]})

    assert response.json() == {"accepted": 3}
    assert count_rows(Event.__table__) == 1


def test_overlapping_batches(client, batch):
    events = batch["events"]
    client.post("/api/events", json={"events": events[:10]})
    client.post("/api/events", json={"events": events[5:]})

    assert count_rows(Event.__table__) == 18


def test_unknown_user_is_created_on_first_event(client, batch):
    client.post("/api/events", json=batch)

    assert count_rows(User.__table__, user_id=FIXTURE_USER) == 1


def test_stored_event_keeps_contract_fields(client, batch):
    client.post("/api/events", json=batch)
    exported = client.get(f"/api/data/{FIXTURE_USER}/export").json()["events"]

    by_id = {e["event_id"]: e for e in exported}
    for sent in batch["events"]:
        stored = by_id[sent["event_id"]]
        for key in ("user_id", "session_id", "round_id", "ts", "source", "type", "payload"):
            assert stored[key] == sent[key], key


def test_empty_batch(client):
    assert client.post("/api/events", json={"events": []}).json() == {"accepted": 0}


def test_beacon_text_plain_body_is_accepted(client, batch):
    """navigator.sendBeacon sends text/plain; it must be parsed as JSON."""
    response = client.post(
        "/api/events", content=json.dumps(batch), headers={"Content-Type": "text/plain;charset=UTF-8"}
    )

    assert response.status_code == 200
    assert count_rows(Event.__table__) == 18


@pytest.mark.parametrize(
    "change",
    [
        {"source": "camera"},
        {"ts": "2026-10-20T09:00:00"},  # no timezone
        {"ts": "yesterday"},
        {"user_id": "not-a-uuid"},
        {"type": ""},
        {"payload": "text"},
        {"extra_field": 1},
    ],
)
def test_invalid_event_rejects_the_whole_batch(client, change):
    good = make_event()
    bad = make_event(**change)

    response = client.post("/api/events", json={"events": [good, bad]})

    assert response.status_code == 422
    assert count_rows(Event.__table__) == 0


def test_missing_field_is_rejected(client):
    event = make_event()
    del event["session_id"]

    assert client.post("/api/events", json={"events": [event]}).status_code == 422


def test_malformed_json_is_rejected(client):
    response = client.post("/api/events", content="{not json", headers={"Content-Type": "application/json"})

    assert response.status_code == 422


def test_batch_size_is_limited(client):
    events = [make_event() for _ in range(501)]

    assert client.post("/api/events", json={"events": events}).status_code == 422


def test_pipeline_receives_only_new_events(client, batch, monkeypatch):
    calls = []
    monkeypatch.setattr(pipeline, "on_new_events", lambda user_id, events: calls.append((user_id, len(events))))

    client.post("/api/events", json=batch)
    client.post("/api/events", json=batch)

    assert calls == [(FIXTURE_USER, 18)]


def test_pipeline_is_called_once_per_user(client, monkeypatch):
    calls = []
    monkeypatch.setattr(pipeline, "on_new_events", lambda user_id, events: calls.append(user_id))
    other = "44444444-4444-4444-8444-444444444444"

    client.post("/api/events", json={"events": [make_event(), make_event(other), make_event()]})

    assert sorted(calls) == sorted([FIXTURE_USER, other])


def test_pipeline_failure_does_not_lose_events(client, batch, monkeypatch):
    def broken(user_id, events):
        raise RuntimeError("scoring bug")

    monkeypatch.setattr(pipeline, "on_new_events", broken)

    response = client.post("/api/events", json=batch)

    assert response.status_code == 200
    assert count_rows(Event.__table__) == 18


def test_events_of_a_deleted_user_are_dropped(client, batch):
    client.post("/api/events", json=batch)
    client.delete(f"/api/data/{FIXTURE_USER}")

    late = client.post("/api/events", json={"events": [make_event()]})

    assert late.status_code == 200
    assert count_rows(Event.__table__) == 0
    assert count_rows(User.__table__) == 0

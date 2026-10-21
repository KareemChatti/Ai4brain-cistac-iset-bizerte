import uuid

from sqlmodel import Session, select

from app import db
from app.models import DeletedUser, Event, Goal, Snapshot, User
from app.routers.data import user_tables
from app.timeutil import utcnow
from tests.conftest import FIXTURE_USER, count_rows, make_event


def _add_snapshot_and_goal(user_id: str) -> None:
    with Session(db.get_engine()) as session:
        session.add(Snapshot(user_id=user_id, ts=utcnow(), trigger="round", dimensions={}))
        session.add(Goal(user_id=user_id, dimension="memory", target=75, baseline=50))
        session.commit()


def test_export_contains_everything(client, batch):
    client.post("/api/events", json=batch)
    _add_snapshot_and_goal(FIXTURE_USER)

    response = client.get(f"/api/data/{FIXTURE_USER}/export")

    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    dump = response.json()
    assert dump["user"]["user_id"] == FIXTURE_USER
    assert len(dump["events"]) == 18
    assert len(dump["snapshots"]) == 1
    assert len(dump["goals"]) == 1
    assert dump["exported_at"].endswith("Z")


def test_export_events_are_in_time_order(client, batch):
    batch["events"].reverse()
    client.post("/api/events", json=batch)

    times = [e["ts"] for e in client.get(f"/api/data/{FIXTURE_USER}/export").json()["events"]]

    assert times == sorted(times)


def test_export_contains_only_that_user(client, batch):
    other = str(uuid.uuid4())
    client.post("/api/events", json=batch)
    client.post("/api/events", json={"events": [make_event(other)]})

    dump = client.get(f"/api/data/{other}/export").json()

    assert [e["user_id"] for e in dump["events"]] == [other]


def test_export_unknown_user_is_404(client):
    assert client.get(f"/api/data/{uuid.uuid4()}/export").status_code == 404


def test_bad_user_id_is_422(client):
    assert client.get("/api/data/not-a-uuid/export").status_code == 422
    assert client.delete("/api/data/not-a-uuid").status_code == 422


def test_delete_leaves_zero_rows(client, batch):
    client.post("/api/events", json=batch)
    _add_snapshot_and_goal(FIXTURE_USER)

    response = client.delete(f"/api/data/{FIXTURE_USER}")

    assert response.json() == {"deleted": True}
    assert count_rows(User.__table__, user_id=FIXTURE_USER) == 0
    for table in user_tables():
        assert count_rows(table, user_id=FIXTURE_USER) == 0, table.name
    assert client.get(f"/api/data/{FIXTURE_USER}/export").status_code == 404


def test_delete_keeps_other_users(client, batch):
    other = str(uuid.uuid4())
    client.post("/api/events", json=batch)
    client.post("/api/events", json={"events": [make_event(other)]})

    client.delete(f"/api/data/{FIXTURE_USER}")

    assert count_rows(Event.__table__, user_id=other) == 1
    assert count_rows(User.__table__, user_id=other) == 1


def test_delete_is_idempotent(client, batch):
    client.post("/api/events", json=batch)

    assert client.delete(f"/api/data/{FIXTURE_USER}").json() == {"deleted": True}
    assert client.delete(f"/api/data/{FIXTURE_USER}").json() == {"deleted": True}
    assert count_rows(DeletedUser.__table__) == 1


def test_tombstone_stores_no_raw_user_id(client, batch):
    client.post("/api/events", json=batch)
    client.delete(f"/api/data/{FIXTURE_USER}")

    with Session(db.get_engine()) as session:
        hashes = session.exec(select(DeletedUser.user_hash)).all()

    assert len(hashes) == 1
    assert FIXTURE_USER not in hashes[0]
    assert len(hashes[0]) == 64


def test_every_user_table_is_covered():
    """Guard: export/delete rely on these tables having a user_id column."""
    names = {table.name for table in user_tables()}

    assert {"events", "snapshots", "goals"} <= names

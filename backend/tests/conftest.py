import copy
import json
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlmodel import Session

from app import db
from app.config import FIXTURES_DIR
from app.main import app

FIXTURE_USER = "11111111-1111-4111-8111-111111111111"
FIXTURE_ROUND = "33333333-3333-4333-8333-333333333333"


def load_fixture(name: str):
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    db.configure("sqlite://")
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def batch() -> dict:
    return copy.deepcopy(load_fixture("events-round.json"))


def count_rows(table, **where) -> int:
    stmt = select(func.count()).select_from(table)
    for column, value in where.items():
        stmt = stmt.where(table.c[column] == value)
    with Session(db.get_engine()) as session:
        return session.connection().execute(stmt).scalar_one()


def make_event(user_id: str = FIXTURE_USER, **overrides) -> dict:
    event = {
        "event_id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_id": str(uuid.uuid4()),
        "round_id": None,
        "ts": "2026-10-20T09:00:00Z",
        "source": "app",
        "type": "goal_set",
        "payload": {"dimension": "memory", "target": 75},
    }
    event.update(overrides)
    return event

"""The Pydantic schemas must accept every sample in shared/fixtures/ (the contract in data)."""

import pytest
from pydantic import TypeAdapter

from app import schemas
from tests.conftest import load_fixture


@pytest.mark.parametrize(
    ("fixture", "shape"),
    [
        ("profile.json", schemas.Profile),
        ("history.json", list[schemas.SnapshotOut]),
        ("projection.json", schemas.Projection),
        ("plan.json", schemas.Plan),
        ("collab.json", schemas.CollabScore),
        ("heatmap.json", schemas.Heatmap),
        ("evidence.json", schemas.EvidenceSheet),
        ("events-round.json", schemas.EventBatch),
    ],
)
def test_fixture_matches_schema(fixture, shape):
    TypeAdapter(shape).validate_python(load_fixture(fixture))


def test_profile_fixture_has_all_dimensions():
    profile = schemas.Profile.model_validate(load_fixture("profile.json"))

    assert set(profile.dimensions) == set(schemas.DIMENSIONS)


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_server_starts_without_the_coach(client):
    """app/coach/ is empty until Member 3 delivers; the rest of the API must still work."""
    paths = client.get("/openapi.json").json()["paths"]

    assert "/api/events" in paths
    assert "/api/data/{user_id}/export" in paths

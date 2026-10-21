import uuid

import pytest

from app.models import User
from tests.conftest import count_rows


def test_create_user_returns_a_uuid(client):
    response = client.post("/api/users", json={"nickname": "Hey"})

    assert response.status_code == 201
    user_id = response.json()["user_id"]
    assert uuid.UUID(user_id).version == 4
    assert count_rows(User.__table__, user_id=user_id) == 1


def test_nickname_whitespace_is_normalised(client):
    user_id = client.post("/api/users", json={"nickname": "  Rami   fan "}).json()["user_id"]

    assert client.get(f"/api/data/{user_id}/export").json()["user"]["nickname"] == "Rami fan"


@pytest.mark.parametrize("nickname", ["Karim", "بطل_الرامي", "demo-new (simulated)", "Hey 2"])
def test_valid_nicknames(client, nickname):
    assert client.post("/api/users", json={"nickname": nickname}).status_code == 201


@pytest.mark.parametrize(
    "nickname",
    [
        "",
        "   ",
        "x" * 33,
        "karim@example.com",
        "+216 22 333 444",
        "22333444",
        "www.example.com",
        "<script>",
    ],
)
def test_contact_details_and_junk_are_rejected(client, nickname):
    assert client.post("/api/users", json={"nickname": nickname}).status_code == 422
    assert count_rows(User.__table__) == 0


def test_consent_is_recorded(client):
    user_id = client.post("/api/users", json={"nickname": "Hey"}).json()["user_id"]

    response = client.post("/api/consent", json={"user_id": user_id, "consent_version": "1.0", "analytics": True})

    assert response.json() == {"ok": True}
    user = client.get(f"/api/data/{user_id}/export").json()["user"]
    assert user["consent_version"] == "1.0"
    assert user["analytics"] is True
    assert user["consent_at"].endswith("Z")


def test_consent_for_unknown_user_is_404(client):
    response = client.post(
        "/api/consent", json={"user_id": str(uuid.uuid4()), "consent_version": "1.0", "analytics": False}
    )

    assert response.status_code == 404

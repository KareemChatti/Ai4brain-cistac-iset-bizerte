import uuid
from datetime import UTC, datetime, timedelta

from app.evidence import card, meld_points
from app.models import User
from app.schemas import CollabScore, EvidenceSheet, Heatmap, Plan, Projection
from app.scoring.adaptive import opponent_level
from app.scoring.collab import collab_from_events
from app.scoring.projection import slope
from app.scoring.rounds import GradedTurn, fast_and_wrong_runs
from tests.conftest import FIXTURE_ROUND, FIXTURE_USER, make_event
from tests.test_profile import minigame


def new_user(client) -> str:
    return client.post("/api/users", json={"nickname": "Hey"}).json()["user_id"]


def fixture_user(client, batch) -> str:
    from sqlmodel import Session

    from app import db

    with Session(db.get_engine()) as session:
        session.add(User(user_id=FIXTURE_USER))
        session.commit()
    client.post("/api/events", json=batch)
    return FIXTURE_USER


def test_evidence_for_the_fixture_round(client, batch):
    uid = fixture_user(client, batch)
    body = client.get(f"/api/evidence/{uid}/{FIXTURE_ROUND}").json()
    sheet = EvidenceSheet.model_validate(body)

    assert sheet.result == "loss"
    assert [f.id for f in sheet.facts] == [f"F{i}" for i in range(1, len(sheet.facts) + 1)]
    kinds = {f.kind for f in sheet.facts}
    assert {"fed_opponent", "low_quality_discard", "missed_lay_off", "recall_probe_wrong",
            "plan_switch", "hint_rejected_bad"} <= kinds
    assert all(".1" not in f.text and ".2" not in f.text for f in sheet.facts)
    assert sheet.stats["turns"] == 16 and sheet.stats["hints_used"] == 1
    assert sheet.profile_delta


def test_evidence_unknown_round_is_404(client):
    uid = new_user(client)
    assert client.get(f"/api/evidence/{uid}/{uuid.uuid4()}").status_code == 404


def test_coach_review_uses_the_real_evidence(client, batch):
    uid = fixture_user(client, batch)
    review = client.post("/api/coach/review", json={"user_id": uid, "round_id": FIXTURE_ROUND}).json()
    assert review["source"] == "template"
    assert any("8H" in m["explanation"] for m in review["key_moments"])


def test_card_names_and_meld_points():
    assert card("8H.1") == "8H" and card("TS.2") == "10S" and card("JK.1") == "a joker"
    assert meld_points(["AH.1", "2H.1", "3H.1"]) == 6
    assert meld_points(["QS.1", "KS.1", "AS.1"]) == 31
    assert meld_points(["7C.1", "JK.1", "9C.2"]) == 24
    assert meld_points(["KD.1", "KS.2", "JK.1"]) == 30


def test_fast_and_wrong_needs_three_in_a_row():
    def turn(n, ms, q):
        return GradedTurn(n, {"think_ms": ms, "quality": q})

    turns = [turn(1, 900, 0.2), turn(2, 800, 0.3), turn(3, 4000, 0.3), turn(4, 700, 0.1),
             turn(5, 600, 0.2), turn(6, 1000, 0.3)]
    runs = fast_and_wrong_runs(turns, 1500, 0.5)
    assert [[t.turn_no for t in r] for r in runs] == [[4, 5, 6]]


def test_plan_for_a_new_user(client):
    uid = new_user(client)
    plan = Plan.model_validate(client.get(f"/api/plan/{uid}").json())
    assert plan.opponent_level == 2
    assert [s.kind for s in plan.steps] == ["rami"]
    assert plan.reason and "In this round" in plan.reason


def test_plan_focuses_the_weakest_dimension(client):
    uid = new_user(client)
    start = datetime(2026, 10, 20, 9, tzinfo=UTC)
    events = []
    for i in range(6):
        events += minigame(uid, 9, (start + timedelta(minutes=i)).isoformat())
    client.post("/api/events", json={"events": events})
    plan = client.get(f"/api/plan/{uid}").json()
    assert plan["focus"] != "memory"
    assert plan["steps"] == [{"kind": "rami"}]


def test_opponent_level_rule():
    assert opponent_level([]) == 2
    assert opponent_level([True, True]) == 3
    assert opponent_level([True, True, True, True, True, True, True, True]) == 5
    assert opponent_level([False, False]) == 1
    assert opponent_level([False, False, False, False]) == 1
    assert opponent_level([True, False, True, False]) == 2


def test_abandoned_round_suggests_a_break(client):
    uid = new_user(client)
    rid, sid = str(uuid.uuid4()), str(uuid.uuid4())
    client.post("/api/events", json={"events": [make_event(
        uid, session_id=sid, round_id=rid, source="rami", type="round_end",
        payload={"winner": "ai", "user_penalty": 100, "ai_penalty": 0, "turns": 3,
                 "duration_ms": 60000, "abandoned": True, "opened": False})]})
    assert client.get(f"/api/profile/{uid}").json()["flags"]["suggest_break"] is True


def _coach_events(uid, hints):
    sid, rid = str(uuid.uuid4()), str(uuid.uuid4())
    events = []
    base = datetime(2026, 10, 20, 9, tzinfo=UTC)
    for i, (followed, good) in enumerate(hints):
        hid = f"h{i}"
        ts = lambda k: (base + timedelta(minutes=i, seconds=k)).isoformat()  # noqa: E731
        common = dict(session_id=sid, round_id=rid, source="coach")
        events += [
            make_event(uid, **common, ts=ts(0), type="hint_requested", payload={"hint_id": hid, "turn_no": i * 5, "ms_into_turn": 5000}),
            make_event(uid, **common, ts=ts(1), type="hint_shown", payload={"hint_id": hid, "action": "discard", "card": "8H.1", "confidence": 0.8}),
            make_event(uid, **common, ts=ts(2), type="hint_followed", payload={"hint_id": hid, "followed": followed}),
            make_event(uid, **common, ts=ts(3), type="hint_outcome", payload={"hint_id": hid, "was_good": good}),
        ]
    return events


class E:
    def __init__(self, d):
        self.type, self.payload, self.round_id = d["type"], d["payload"], d["round_id"]
        self.ts = datetime.fromisoformat(d["ts"].replace("Z", "+00:00"))


def test_following_every_bad_hint_gives_low_verification():
    events = [E(e) for e in _coach_events(FIXTURE_USER, [(True, False)] * 5)]
    score = collab_from_events(events)
    assert score.components["verification"].score == 0
    assert score.components["verification"].n == 5


def test_no_hints_means_full_autonomy_and_null_clarification():
    turns = [E(make_event(FIXTURE_USER, source="rami", type="turn", payload={"turn_no": i})) for i in range(10)]
    score = collab_from_events(turns)
    assert score.components["autonomy"].score == 100
    assert score.components["clarification"].score is None
    assert score.total == 100


def test_personal_data_and_early_hints_lower_responsible_use():
    events = [
        E(make_event(FIXTURE_USER, source="coach", type="chat_message", payload={"length": 20, "contains_personal_data": True})),
        E(make_event(FIXTURE_USER, source="coach", type="hint_requested", payload={"hint_id": "h", "turn_no": 1, "ms_into_turn": 500})),
    ]
    assert collab_from_events(events).components["responsible_use"].score == 70


def test_collab_endpoint(client, batch):
    uid = fixture_user(client, batch)
    body = CollabScore.model_validate(client.get(f"/api/collab/{uid}").json())
    assert body.total is not None
    assert body.components["verification"].score == 100


def test_heatmap_slots_use_tunisia_time(client):
    uid = new_user(client)
    client.post("/api/events", json={"events": minigame(uid, 7, "2026-10-20T07:30:00Z")})
    heat = Heatmap.model_validate(client.get(f"/api/heatmap/{uid}").json())
    row = heat.rows.index("memory")
    assert heat.cols[0] == "08-12"
    assert heat.cells[row][0] is not None
    assert all(v is None for v in heat.cells[row][1:])


def test_goal_progress(client):
    uid = new_user(client)
    goals = client.post(f"/api/goals/{uid}", json={"dimension": "memory", "target": 80}).json()
    assert goals[0]["progress"] == 0
    events = []
    for i in range(8):
        events += minigame(uid, 9, f"2026-10-20T09:0{i}:00Z")
    client.post("/api/events", json={"events": events})
    goals = client.get(f"/api/goals/{uid}").json()
    assert len(goals) == 1 and 0 < goals[0]["progress"] <= 1
    assert len(client.post(f"/api/goals/{uid}", json={"dimension": "memory", "target": 90}).json()) == 1


def test_projection_band_widens_and_carries_the_disclaimer(client):
    uid = new_user(client)
    body = Projection.model_validate(client.get(f"/api/profile/{uid}/projection?sessions_per_week=5&weeks=3").json())
    memory = [p for p in body.points if p.dimension == "memory"]
    assert [p.week for p in memory] == [0, 1, 2, 3]
    assert memory[0].score == memory[3].score
    assert (memory[3].high - memory[3].low) >= (memory[0].high - memory[0].low)
    assert "Not a prediction" in body.disclaimer


def test_projection_gain_follows_progress(client):
    uid = new_user(client)
    events = []
    for i, span in enumerate([3, 4, 5, 6, 7, 8]):
        events += minigame(uid, span, f"2026-10-{10 + i}T09:00:00Z", session_id=str(uuid.uuid4()))
    client.post("/api/events", json={"events": events})
    points = client.get(f"/api/profile/{uid}/projection?sessions_per_week=3&weeks=2").json()["points"]
    memory = [p for p in points if p["dimension"] == "memory"]
    assert memory[2]["score"] > memory[0]["score"]
    assert memory[2]["score"] - memory[0]["score"] <= 2 * 3 * 2 + 0.1


def test_slope():
    assert slope([1, 2, 3]) == 1
    assert slope([5]) == 0

"""Events -> 0-100 observations, one formula per dimension (docs/scoring.md)."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.scoring.observations import (
    R_MINIGAME,
    R_ROUND,
    minigame_observation,
    round_observations,
    session_minigame_observations,
)
from tests.conftest import load_fixture

T0 = datetime(2026, 10, 1, 18, 0, tzinfo=UTC)


@dataclass
class Ev:
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    ts: datetime = T0
    event_id: str = "e"
    session_id: str = "s1"
    round_id: str | None = None


def end(game, **payload):
    return Ev("minigame_end", {"game": game, **payload}, ts=T0 + timedelta(minutes=1), event_id=f"end-{game}")


def trial(game, correct=True, **extra):
    return Ev("trial", {"game": game, "correct": correct, "extra": extra})


# ---------- mini-games ----------
def test_card_recall_uses_the_longest_correct_span():
    o = minigame_observation(end("card_recall", level_end=6), [trial("card_recall", span=5),
                                                                trial("card_recall", False, span=7)])
    assert o.dimension == "memory"
    assert o.value == pytest.approx((5 - 2) / 7 * 100)
    assert o.noise == R_MINIGAME


def test_card_recall_falls_back_to_score_raw():
    assert minigame_observation(end("card_recall", score_raw=9), []).value == 100


def test_meld_spotter_with_hits_and_false_alarms():
    trials = [trial("meld_spotter", hits=3, targets=4, false_alarms=1, decoys=8)]
    o = minigame_observation(end("meld_spotter", level_end=2), trials)

    assert o.dimension == "attention"
    assert o.value == pytest.approx((0.75 - 0.125) * 100 + 10)


def test_meld_spotter_falls_back_to_accuracy():
    assert minigame_observation(end("meld_spotter", accuracy=0.5, level_end=1), []).value == pytest.approx(55)


def test_quick_match_correct_per_minute():
    trials = [trial("quick_match")] * 24 + [trial("quick_match", False)] * 6
    o = minigame_observation(end("quick_match"), trials)

    assert o.dimension == "speed"
    assert o.value == pytest.approx(24 / 0.75 / 40 * 100)  # 32 per minute -> 80


def test_rami_puzzle():
    o = minigame_observation(end("rami_puzzle", accuracy=0.5, level_end=5), [])

    assert o.dimension == "reasoning"
    assert o.value == pytest.approx(50)


def test_rule_switch_uses_trials_to_adapt():
    trials = [trial("rule_switch", trials_to_adapt=2), trial("rule_switch", trials_to_adapt=4), trial("rule_switch")]
    o = minigame_observation(end("rule_switch"), trials)

    assert o.dimension == "flexibility"
    assert o.value == pytest.approx(100 - 12 * 3)


def test_rule_switch_without_any_switch_gives_no_observation():
    assert minigame_observation(end("rule_switch", accuracy=1.0), [trial("rule_switch")]) is None


def test_values_are_clamped():
    assert minigame_observation(end("rami_puzzle", accuracy=1.0, level_end=20), []).value == 100
    assert minigame_observation(end("rule_switch"), [trial("rule_switch", trials_to_adapt=30)]).value == 0


def test_unknown_game_for_a_known_dimension_uses_accuracy():
    o = minigame_observation(end("new_game", dimension="attention", accuracy=0.7), [])

    assert (o.dimension, o.value) == ("attention", pytest.approx(70))


def test_unknown_dimension_is_ignored():
    assert minigame_observation(end("new_game", dimension="creativity", accuracy=0.7), []) is None


def test_each_end_takes_only_its_own_trials():
    first_end = Ev("minigame_end", {"game": "card_recall"}, ts=T0 + timedelta(seconds=10), event_id="end1")
    second_trial = Ev("trial", {"game": "card_recall", "correct": True, "extra": {"span": 8}},
                      ts=T0 + timedelta(seconds=20))
    second_end = Ev("minigame_end", {"game": "card_recall"}, ts=T0 + timedelta(seconds=30), event_id="end2")
    events = [trial("card_recall", span=4), first_end, second_trial, second_end]

    observations = session_minigame_observations(events)

    assert [round(o.value, 1) for o in observations] == [round(2 / 7 * 100, 1), round(6 / 7 * 100, 1)]


# ---------- rounds ----------
def fixture_round_events():
    events = load_fixture("events-round.json")["events"]
    return [
        Ev(e["type"], e["payload"], datetime.fromisoformat(e["ts"]), e["event_id"], e["session_id"], e["round_id"])
        for e in events if e["source"] == "rami"
    ]


def test_fixture_round_gives_all_five_dimensions():
    observations = {o.dimension: o for o in round_observations(fixture_round_events())}

    assert set(observations) == {"memory", "attention", "speed", "reasoning", "flexibility"}
    assert all(o.noise == R_ROUND and o.kind == "round" for o in observations.values())
    # recall probe wrong (0%) and one discard fed the opponent: 0 - 10, clamped to 0
    assert observations["memory"].value == 0
    # one missed lay-off, nothing used
    assert observations["attention"].value == 0
    # median think time per option = 4100 / 9 ms
    assert observations["speed"].value == pytest.approx(100 * (1 - (4100 / 9 - 300) / 1500))
    # one graded turn, quality 0.31
    assert observations["reasoning"].value == pytest.approx(31)
    # one plan switch after waiting 1 turn
    assert observations["flexibility"].value == pytest.approx(80)


def test_round_needs_its_round_end():
    events = [e for e in fixture_round_events() if e.type != "round_end"]

    assert round_observations(events) == []


def test_reasoning_waits_for_grades():
    events = [e for e in fixture_round_events() if e.type != "turn_graded"]

    assert "reasoning" not in {o.dimension for o in round_observations(events)}


def test_turn_graded_replaces_the_live_quality():
    events = fixture_round_events()
    turn7 = next(e for e in events if e.type == "turn" and e.payload["turn_no"] == 7)
    turn7.payload = {**turn7.payload, "quality": 0.9}

    reasoning = next(o for o in round_observations(events) if o.dimension == "reasoning")

    assert reasoning.value == pytest.approx(31)


def test_attention_counts_melds_laid_down():
    events = [
        Ev("turn", {"laid_down": [["7H.1", "8H.1", "9H.1"], ["KS.1", "KD.1", "KC.2"]], "laid_off": 1,
                    "joker_swaps": 0, "missed": {"lay_offs": 1, "joker_swaps": 0, "melds_in_hand": 0}}),
        Ev("round_end", {"winner": "user"}, round_id="r1"),
    ]
    attention = next(o for o in round_observations(events) if o.dimension == "attention")

    assert attention.value == pytest.approx(100 * (1 - 1 / 4))


def test_malformed_payloads_do_not_crash():
    events = [
        Ev("turn", {"think_ms": "slow", "options_count": 0, "missed": None, "laid_down": "x", "quality": True}),
        Ev("recall_probe", {}),
        Ev("plan_switch", {"turns_waited": None}),
        Ev("round_end", {}, round_id="r1"),
    ]

    assert {o.dimension for o in round_observations(events)} == {"memory"}

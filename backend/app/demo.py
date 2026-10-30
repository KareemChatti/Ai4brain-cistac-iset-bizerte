"""Simulated demo players, so the dashboard is not empty in the demo.

Two players are generated and posted through the real pipeline (`ingest`, the same path
as the live game), so their profile, history, projection, matches, collaboration score
and evidence sheets are genuine outputs of the system:

- "Demo improver (simulated)": three weeks of matches to 401, getting slowly better at
  reasoning, memory and flexibility, relying less on hints and following more coach tips.
- "Demo newcomer (simulated)": two short recent sessions ("still learning about you").

Their events are synthetic but follow the contract exactly. Both users are marked
`is_demo` and their nickname says "simulated". Run:  python -m scripts.seed_demo [--reset]
"""

import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.db import session_scope
from app.models import DeletedUser, User
from app.privacy import user_hash
from app.routers.data import delete_user_data
from app.routers.events import ingest
from app.schemas import EventIn
from app.timeutil import utcnow

NAMESPACE = uuid.UUID("6f1d2c1e-9a55-4c1f-8f3e-0d5e1a7b2c90")
RANKS = "A23456789TJQK"
SUITS = "SHDC"
RULES = {"decks": 2, "jokers": 4, "hand_size": 14, "opening_min": 71, "opponent_level": 3}


@dataclass(frozen=True)
class DemoPlayer:
    key: str
    nickname: str
    days: int  # how far back the history starts
    sessions: int
    skill_start: float  # 0..1
    skill_end: float

    @property
    def user_id(self) -> str:
        return str(uuid.uuid5(NAMESPACE, self.key))


DEMO_PLAYERS = (
    DemoPlayer("demo-improver", "Demo improver (simulated)", days=21, sessions=12, skill_start=0.2, skill_end=0.8),
    DemoPlayer("demo-newcomer", "Demo newcomer (simulated)", days=2, sessions=2, skill_start=0.35, skill_end=0.4),
)

LOCAL_HOURS = (9, 13, 18, 21)  # sessions spread over the day, for the heatmap
TUNIS_OFFSET = timedelta(hours=1)  # Africa/Tunis is UTC+1


class _Builder:
    """Builds contract events for one player, with deterministic ids."""

    def __init__(self, player: DemoPlayer, rng: random.Random):
        self.p = player
        self.rng = rng
        self.n = 0
        self.events: list[dict] = []
        self.session_id = ""

    def uid(self, label: str) -> str:
        self.n += 1
        return str(uuid.uuid5(NAMESPACE, f"{self.p.key}:{label}:{self.n}"))

    def card(self) -> str:
        return f"{self.rng.choice(RANKS)}{self.rng.choice(SUITS)}.{self.rng.randint(1, 2)}"

    def emit(self, ts: datetime, source: str, type_: str, payload: dict, round_id: str | None = None) -> None:
        self.events.append({
            "event_id": self.uid("event"), "user_id": self.p.user_id, "session_id": self.session_id,
            "round_id": round_id, "ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": source, "type": type_,
            "payload": payload,
        })

    def chance(self, p: float) -> bool:
        return self.rng.random() < max(0.0, min(1.0, p))

    def play_round(self, start: datetime, skill: float, match_id: str | None) -> tuple[datetime, int, int, str]:
        """One round; returns its end time, both penalties and the winner."""
        rid = self.uid("round")
        t = start
        self.emit(t, "rami", "round_start", {
            "opponent_level": RULES["opponent_level"], "seed": self.rng.randint(1, 10**6), "quick_mode": False,
            "hints_enabled": True, "live_coach": True, "rules": RULES, "match_id": match_id,
        }, rid)
        turns = self.rng.randint(9, 15)
        opened_at = self.rng.randint(4, 8) if self.chance(0.55 + 0.35 * skill) else None
        qualities: list[tuple[int, float, str]] = []
        for k in range(1, turns + 1):
            t += timedelta(seconds=self.rng.randint(15, 45))
            # Weaker players think in bursts: some very fast discards.
            think = self.rng.randint(700, 1400) if self.chance(0.25 - 0.18 * skill) else self.rng.randint(2500, 9000)
            missed_lay = 1 if opened_at and k > opened_at and self.chance(0.35 - 0.3 * skill) else 0
            discarded, best = self.card(), self.card()
            quality = round(max(0.0, min(1.0, self.rng.gauss(0.4 + 0.45 * skill, 0.18))), 2)
            qualities.append((k, quality, best))
            self.emit(t, "rami", "turn", {
                "turn_no": k, "draw_source": "discard" if self.chance(0.2) else "stock", "drawn": self.card(),
                "discarded": discarded,
                "laid_down": [[self.card(), self.card(), self.card()], [self.card(), self.card(), self.card()]]
                if k == opened_at else [],
                "laid_off": 1 if opened_at and k > opened_at and self.chance(0.3) else 0, "joker_swaps": 0,
                "think_ms": think, "options_count": self.rng.randint(8, 18),
                "missed": {"lay_offs": missed_lay, "joker_swaps": 0, "melds_in_hand": 0},
                "fed_opponent": self.chance(0.22 - 0.16 * skill), "quality": None, "best_discard": None,
                "turns_to_out_played": None, "turns_to_out_best": None,
            }, rid)
            if k % 6 == 3:
                self.emit(t + timedelta(seconds=5), "rami", "recall_probe", {
                    "turn_no": k, "question": "Which card did your opponent discard last turn?",
                    "correct": self.chance(0.45 + 0.45 * skill), "rt_ms": self.rng.randint(2500, 7000),
                }, rid)
            if missed_lay:
                self.emit(t + timedelta(seconds=1), "coach", "coach_alert", {
                    "kind": "missed_lay_off", "turn_no": k, "cards": [discarded.split(".")[0]],
                    "followed": self.chance(0.35 + 0.5 * skill),
                }, rid)
            if self.chance(0.32 - 0.22 * skill):  # hints: fewer as the player gets better
                hid = self.uid("hint")
                good = self.chance(0.75)
                self.emit(t - timedelta(seconds=8), "coach", "hint_requested",
                          {"hint_id": hid, "turn_no": k, "ms_into_turn": self.rng.randint(800, 1900) if self.chance(0.15 - 0.12 * skill) else self.rng.randint(3000, 12000)}, rid)
                self.emit(t - timedelta(seconds=7), "coach", "hint_shown", {
                    "hint_id": hid, "action": "discard", "card": discarded, "confidence": round(self.rng.uniform(0.45, 0.9), 2),
                }, rid)
                if self.chance(0.3 + 0.4 * skill):
                    self.emit(t - timedelta(seconds=5), "coach", "hint_why", {"hint_id": hid}, rid)
                followed = good if self.chance(0.5 + 0.4 * skill) else not good
                self.emit(t - timedelta(seconds=1), "coach", "hint_followed", {"hint_id": hid, "followed": followed}, rid)
                self.emit(t + timedelta(minutes=10), "coach", "hint_outcome", {"hint_id": hid, "was_good": good}, rid)
            if k == 6 and self.chance(0.5):
                self.emit(t + timedelta(seconds=2), "rami", "plan_switch", {
                    "turn_no": k, "from": "run", "to": "set",
                    "turns_waited": max(0, round(self.rng.gauss(3.2 - 2.6 * skill, 0.8))),
                }, rid)

        won = self.chance(0.3 + 0.4 * skill)
        loser_penalty = 100 if not opened_at else self.rng.randint(18, 95)
        user_pen, ai_pen = (0, self.rng.randint(25, 110)) if won else (loser_penalty, 0)
        t += timedelta(seconds=20)
        self.emit(t, "rami", "round_end", {
            "winner": "user" if won else "ai", "user_penalty": user_pen, "ai_penalty": ai_pen, "turns": turns * 2,
            "duration_ms": int((t - start).total_seconds() * 1000), "abandoned": False, "opened": bool(opened_at),
        }, rid)
        for k, quality, best in qualities:
            self.emit(t + timedelta(seconds=3), "rami", "turn_graded", {
                "turn_no": k, "quality": quality, "best_discard": best,
                "turns_to_out_played": round(4.5 - 2 * quality, 1), "turns_to_out_best": round(4.5 - 2 * min(1, quality + 0.2), 1),
            }, rid)
        if self.chance(0.55 + 0.35 * skill):
            self.emit(t + timedelta(seconds=30), "coach", "review_opened", {"round_id": rid}, rid)
        return t + timedelta(minutes=1), user_pen, ai_pen, "user" if won else "ai"


def build_demo_events(player: DemoPlayer, now: datetime | None = None, seed: int = 2026) -> list[dict]:
    """All the events of one demo player, oldest first."""
    now = now or utcnow()
    rng = random.Random(f"{seed}:{player.key}")
    b = _Builder(player, rng)
    first_day = (now - timedelta(days=player.days)).replace(minute=0, second=0, microsecond=0)
    match_id, totals, rounds_in_match = None, [0, 0], 0
    for s in range(player.sessions):
        progress = s / max(1, player.sessions - 1)
        skill = player.skill_start + (player.skill_end - player.skill_start) * progress
        day = first_day + timedelta(days=round(progress * max(0, player.days - 1)))
        start = day.replace(hour=LOCAL_HOURS[s % len(LOCAL_HOURS)]) - TUNIS_OFFSET
        if start > now - timedelta(hours=1):
            start = now - timedelta(hours=2)
        b.session_id = b.uid("session")
        t = start
        if s == 0:
            b.emit(t, "app", "consent_given", {"consent_version": "2026-10-v1", "analytics": False})
        for _ in range(rng.randint(2, 3)):
            if match_id is None:
                match_id, totals, rounds_in_match = b.uid("match"), [0, 0], 0
                b.emit(t, "rami", "match_start", {"match_id": match_id, "target": 401, "rules": RULES})
            t, user_pen, ai_pen, _ = b.play_round(t + timedelta(seconds=10), skill, match_id)
            totals = [totals[0] + user_pen, totals[1] + ai_pen]
            rounds_in_match += 1
            if max(totals) >= 401:
                winner = "user" if totals[0] <= totals[1] else "ai"
                b.emit(t, "rami", "match_end", {
                    "match_id": match_id, "winner": winner, "user_total": totals[0], "ai_total": totals[1],
                    "rounds": rounds_in_match, "target": 401,
                })
                match_id = None
    return sorted(b.events, key=lambda e: e["ts"])


def seed_demo(reset: bool = False, now: datetime | None = None) -> dict[str, int]:
    """Create the demo players (skipped if they exist, unless reset). Returns events stored per player."""
    stored: dict[str, int] = {}
    for player in DEMO_PLAYERS:
        with session_scope() as session:
            existing = session.get(User, player.user_id)
            if existing and not reset:
                continue
            if existing:
                delete_user_data(session, player.user_id)
                session.commit()
            # A reset leaves a tombstone, which would drop the new events: clear it for demo players.
            tomb = session.get(DeletedUser, user_hash(player.user_id))
            if tomb:
                session.delete(tomb)
            now_ = now or utcnow()
            started = now_ - timedelta(days=player.days)
            session.add(User(
                user_id=player.user_id, nickname=player.nickname, is_demo=True, created_at=started,
                last_active_at=now_, consent_version="2026-10-v1", consent_at=started,
            ))
            session.commit()
        events = [EventIn.model_validate(e) for e in build_demo_events(player, now)]
        # Post session by session, like a real player, so the pipeline scores as it goes.
        by_session: dict[str, list[EventIn]] = {}
        for e in events:
            by_session.setdefault(str(e.session_id), []).append(e)
        for batch in by_session.values():
            with session_scope() as session:
                ingest(session, batch)
        stored[player.nickname] = len(events)
    return stored

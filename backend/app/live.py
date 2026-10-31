import logging
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError

from app.config import settings
from app.db import session_scope
from app.models import User
from app.routers.events import ingest
from app.schemas import DIMENSIONS, EventBatch, EventIn, Profile
from app.scoring.observations import num
from app.scoring.profile import build_profile

log = logging.getLogger(__name__)
router = APIRouter()

FAST_MS = 1500
FAST_STREAK = 3
SCORING_EVENTS = {"round_end", "turn_graded", "match_end"}
LABELS = {d: d.capitalize() for d in DIMENSIONS}


@dataclass
class LiveState:

    fast_streak: int = 0
    ignored: dict[str, int] = field(default_factory=dict)


def _face(card_id: object) -> str:
    return str(card_id).split(".")[0].replace("T", "10") if card_id else "a card"


def _coach(kind: str, text: str, event: EventIn) -> dict:
    return {
        "type": "coach",
        "kind": kind,
        "text": text,
        "turn_no": event.payload.get("turn_no"),
        "round_id": str(event.round_id) if event.round_id else None,
    }


def profile_change(before: Profile | None, after: Profile | None) -> str | None:
    if not before or not after:
        return None
    moves = []
    for d in DIMENSIONS:
        a, b = before.dimensions[d].score, after.dimensions[d].score
        if abs(b - a) >= 0.5:
            moves.append(f"{LABELS[d]} {a:.0f} → {b:.0f}")
    return ", ".join(moves) or None


def live_messages(state: LiveState, events: list[EventIn], before: Profile | None, after: Profile | None) -> list[dict]:
    out: list[dict] = []
    for e in sorted(events, key=lambda x: x.ts):
        p = e.payload
        if e.type == "round_start":
            state.fast_streak = 0
            state.ignored = {}
            out.append(_coach("round_start", "New round. I'm following your moves live.", e))
        elif e.type == "turn":
            think = num(p, "think_ms")
            state.fast_streak = state.fast_streak + 1 if think is not None and think < FAST_MS else 0
            if state.fast_streak == FAST_STREAK:
                out.append(_coach("pace", "Three quick discards in a row. A few seconds of thought often finds a better move.", e))
            if p.get("fed_opponent") is True:
                out.append(_coach(
                    "fed_opponent",
                    f"Your opponent picked up the {_face(p.get('discarded'))} you discarded. Watch which suits they collect.",
                    e,
                ))
        elif e.type == "recall_probe":
            if p.get("correct") is True:
                out.append(_coach("recall", "Well remembered.", e))
            else:
                out.append(_coach("recall", "Not quite. Keep an eye on what your opponent picks up.", e))
        elif e.type == "coach_alert" and p.get("followed") is False:
            kind = str(p.get("kind"))
            state.ignored[kind] = state.ignored.get(kind, 0) + 1
            if state.ignored[kind] == 2:
                out.append(_coach("alerts_skipped", "You passed on the same tip twice this round. It is worth a second look next time.", e))
        elif e.type == "round_end":
            if p.get("abandoned") is True:
                continue
            won = p.get("winner") == "user"
            change = profile_change(before, after)
            text = ("You went out. " if won else "Round over. ") + (
                f"Your Brain Twin moved: {change}." if change else "Your Brain Twin is updated."
            )
            out.append(_coach("round_summary", text, e))
        elif e.type == "match_end":
            won = p.get("winner") == "user"
            out.append(_coach(
                "match_summary",
                f"Match over: {'you won' if won else 'your opponent won'}, "
                f"{num(p, 'user_total') or 0:.0f} to {num(p, 'ai_total') or 0:.0f} penalty points.",
                e,
            ))
    return out


def handle_events(user_id: str, events: list[EventIn], state: LiveState) -> list[dict]:
    scoring = any(e.type in SCORING_EVENTS for e in events)
    with session_scope() as session:
        known = session.get(User, user_id) is not None
        before = build_profile(session, user_id) if scoring and known else None
        new = ingest(session, events)
    with session_scope() as session:
        after = build_profile(session, user_id) if scoring and session.get(User, user_id) else None
    replies: list[dict] = [{"type": "ack", "event_ids": [str(e.event_id) for e in events]}]
    replies += live_messages(state, new, before, after)
    if after is not None:
        replies.append({"type": "profile", "profile": after.model_dump(mode="json")})
    return replies


@router.websocket("/ws/session/{user_id}")
async def live_session(websocket: WebSocket, user_id: str) -> None:
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    try:
        user_id = str(UUID(user_id))
    except ValueError:
        await websocket.close(code=1008)
        return
    if origin and origin not in settings.cors_origins:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    state = LiveState()
    await websocket.send_json({"type": "hello", "user_id": user_id})
    try:
        while True:
            try:
                message = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"type": "error", "message": "Messages must be JSON."})
                continue
            kind = message.get("type") if isinstance(message, dict) else None
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
            elif kind == "events":
                try:
                    batch = EventBatch.model_validate({"events": message.get("events")})
                except ValidationError as err:
                    await websocket.send_json({"type": "error", "message": "Invalid events.", "detail": err.errors(include_url=False, include_context=False)[:3]})
                    continue
                if any(str(e.user_id) != user_id for e in batch.events):
                    await websocket.send_json({"type": "error", "message": "Events must belong to this session's user."})
                    continue
                for reply in await run_in_threadpool(handle_events, user_id, batch.events, state):
                    await websocket.send_json(reply)
            else:
                await websocket.send_json({"type": "error", "message": f"Unknown message type: {kind!r}."})
    except WebSocketDisconnect:
        return

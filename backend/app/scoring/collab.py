from sqlmodel import Session

from app.schemas import CollabScore
from app.scoring.history import recent_session_ids, user_events
from app.scoring.observations import num

WEIGHTS = {"clarification": 0.20, "verification": 0.25, "iteration": 0.20, "autonomy": 0.20, "responsible_use": 0.15}
SESSIONS = 10
LOW_CONFIDENCE = 0.6
TOO_EARLY_MS = 2000


def _pct(part: float, whole: float) -> float:
    return round(min(100.0, 100.0 * part / whole), 1)


def collab_from_events(events) -> CollabScore:
    events = sorted(events, key=lambda e: e.ts)
    by_type: dict[str, list] = {}
    for e in events:
        by_type.setdefault(e.type, []).append(e)

    def of(kind: str) -> list:
        return by_type.get(kind, [])

    shown = {e.payload.get("hint_id"): e for e in of("hint_shown")}
    followed = {e.payload.get("hint_id"): e for e in of("hint_followed")}
    outcome = {e.payload.get("hint_id"): e.payload.get("was_good") for e in of("hint_outcome")}
    why = {e.payload.get("hint_id") for e in of("hint_why")}
    checked = {e.payload.get("hint_id") for e in of("hint_checked")}
    chats = of("chat_message")

    def questioned(hint_id, shown_event) -> bool:
        if hint_id in why:
            return True
        acted = followed.get(hint_id)
        end = acted.ts if acted else None
        return any(c.ts >= shown_event.ts and (end is None or c.ts <= end) for c in chats)

    clarification = (
        {"score": _pct(sum(questioned(h, e) for h, e in shown.items()), len(shown)), "n": len(shown)}
        if shown else {"score": None, "n": 0}
    )

    decided = [h for h in followed if h in outcome and isinstance(outcome[h], bool)]
    alerts = [a for a in of("coach_alert") if isinstance(a.payload.get("followed"), bool)]
    if decided or alerts:
        right = sum(followed[h].payload.get("followed") is outcome[h] for h in decided)
        right += sum(a.payload.get("followed") is True for a in alerts)
        score = _pct(right, len(decided) + len(alerts))
        low_conf = [h for h, e in shown.items() if (num(e.payload, "confidence") or 1) < LOW_CONFIDENCE]
        if any(h in checked for h in low_conf):
            score = min(100.0, score + 10)
        verification = {"score": score, "n": len(decided) + len(alerts)}
    else:
        verification = {"score": None, "n": 0}

    rounds = of("round_end")
    learn = len(of("position_retried")) + len(of("review_opened"))
    iteration = {"score": _pct(learn, len(rounds)), "n": len(rounds)} if rounds else {"score": None, "n": 0}

    requests = of("hint_requested")
    turns = of("turn")
    autonomy = (
        {"score": round(max(0.0, 100 * (1 - len(requests) / len(turns))), 1), "n": len(turns)}
        if turns else {"score": None, "n": 0}
    )

    n_responsible = len(requests) + len(chats)
    if n_responsible:
        score = 100.0
        score -= 10 * sum(1 for r in requests if (num(r.payload, "ms_into_turn") or TOO_EARLY_MS) < TOO_EARLY_MS)
        score -= 10 * _spam_bursts(requests)
        score -= 20 * sum(1 for c in chats if c.payload.get("contains_personal_data") is True)
        responsible = {"score": max(0.0, score), "n": n_responsible}
    else:
        responsible = {"score": None, "n": 0}

    components = {
        "clarification": clarification, "verification": verification, "iteration": iteration,
        "autonomy": autonomy, "responsible_use": responsible,
    }
    used = {k: c["score"] for k, c in components.items() if c["score"] is not None}
    total = (
        round(sum(WEIGHTS[k] * v for k, v in used.items()) / sum(WEIGHTS[k] for k in used), 1) if used else None
    )
    return CollabScore.model_validate({"total": total, "components": components, "weights": WEIGHTS})


def _spam_bursts(requests) -> int:
    bursts = 0
    by_round: dict = {}
    for r in requests:
        turn = r.payload.get("turn_no")
        if isinstance(turn, int):
            by_round.setdefault(r.round_id, []).append(turn)
    for turns in by_round.values():
        turns.sort()
        i = 0
        while i < len(turns):
            window = [t for t in turns[i:] if t <= turns[i] + 2]
            if len(window) >= 3:
                bursts += 1
                i += len(window)
            else:
                i += 1
    return bursts


def collab_score(session: Session, user_id: str) -> CollabScore:
    sessions = set(recent_session_ids(session, user_id, SESSIONS))
    return collab_from_events([e for e in user_events(session, user_id) if e.session_id in sessions])

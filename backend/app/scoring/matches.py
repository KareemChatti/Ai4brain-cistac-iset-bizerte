from sqlmodel import Session, select

from app.models import Event
from app.schemas import MatchRound, MatchSummary
from app.timeutil import iso

MATCH_TYPES = ("match_start", "match_end", "round_start", "round_end")


def matches_from_events(events) -> list[MatchSummary]:
    matches: dict[str, dict] = {}
    round_match: dict[str, str] = {}
    for e in sorted(events, key=lambda e: e.ts):
        p = e.payload or {}
        if e.type == "match_start" and p.get("match_id"):
            matches[p["match_id"]] = {
                "match_id": p["match_id"], "target": int(p.get("target") or 0), "started_at": iso(e.ts),
                "ended_at": None, "winner": None, "user_total": 0, "ai_total": 0, "rounds": [],
            }
        elif e.type == "round_start" and e.round_id and p.get("match_id"):
            round_match[str(e.round_id)] = p["match_id"]
        elif e.type == "round_end" and e.round_id:
            m = matches.get(round_match.get(str(e.round_id), ""))
            if m is None or p.get("abandoned") is True:
                continue
            user, ai = int(p.get("user_penalty") or 0), int(p.get("ai_penalty") or 0)
            m["rounds"].append({"round_id": str(e.round_id), "user_penalty": user, "ai_penalty": ai,
                                "winner": p.get("winner")})
            m["user_total"] += user
            m["ai_total"] += ai
        elif e.type == "match_end" and p.get("match_id") in matches:
            m = matches[p["match_id"]]
            m["ended_at"] = iso(e.ts)
            m["winner"] = p.get("winner")
            m["user_total"] = int(p.get("user_total", m["user_total"]))
            m["ai_total"] = int(p.get("ai_total", m["ai_total"]))
    ordered = sorted(matches.values(), key=lambda m: m["started_at"], reverse=True)
    return [MatchSummary(**{**m, "rounds": [MatchRound(**r) for r in m["rounds"]]}) for m in ordered]


def match_history(session: Session, user_id: str, limit: int = 20) -> list[MatchSummary]:
    events = session.exec(select(Event).where(Event.user_id == user_id, Event.type.in_(MATCH_TYPES))).all()
    return matches_from_events(events)[:limit]

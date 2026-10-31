import statistics
from datetime import datetime

from sqlmodel import Session, select

from app.db import session_scope
from app.models import Event
from app.schemas import EvidenceSheet
from app.scoring.observations import num
from app.scoring.pipeline import load_observations
from app.scoring.rounds import GradedTurn, fast_and_wrong_runs, graded_turns
from app.scoring.twin import Twin, _ordered

LOW_QUALITY = 0.5
FAST_MS = 1500
BEST_TURN_MIN_QUALITY = 0.8
RANKS = "A23456789TJQK"
WORDS = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}


def card(card_id: str | None) -> str:
    if not card_id:
        return "a card"
    code = str(card_id).split(".")[0]
    if code == "JK":
        return "a joker"
    return ("10" + code[1:]) if code.startswith("T") else code


def _rank_value(index: int) -> int:
    if index == 0:
        return 1
    if index == 13:
        return 11
    return min(index + 1, 10)


def meld_points(meld: list[str]) -> int:
    codes = [str(c).split(".")[0] for c in meld]
    real = [(i, c[0]) for i, c in enumerate(codes) if c != "JK"]
    if not real:
        return 0
    if len({r for _, r in real}) == 1:
        rank = real[0][1]
        return (11 if rank == "A" else _rank_value(RANKS.index(rank))) * len(codes)
    ace_high = any(r in "QK" for _, r in real)

    def index(rank: str) -> int:
        return 13 if rank == "A" and ace_high else RANKS.index(rank)

    pos, rank = real[0]
    start = index(rank) - pos
    return sum(_rank_value(start + i) for i in range(len(codes)))


def _turn_facts(turns: list[GradedTurn]) -> list[dict]:
    facts = []
    for t in turns:
        p = t.payload
        n = t.turn_no
        if p.get("fed_opponent") is True:
            facts.append(dict(dimension="memory", kind="fed_opponent", turn_no=n, value=None,
                              text=f"Turn {n}: you discarded {card(p.get('discarded'))} and your opponent "
                                   f"was able to use it."))
        missed = p.get("missed") if isinstance(p.get("missed"), dict) else {}
        for key, kind, what in (
            ("lay_offs", "missed_lay_off", "card that could have been added to a meld on the table"),
            ("joker_swaps", "missed_joker_swap", "joker on the table you could have swapped for the real card"),
            ("melds_in_hand", "missed_meld", "complete meld in your hand you could have laid down"),
        ):
            count = int(num(missed, key) or 0)
            if count:
                again = f" This happened {WORDS.get(count, count)} times." if count > 1 else ""
                facts.append(dict(dimension="attention", kind=kind, turn_no=n, value=count,
                                  text=f"Turn {n}: you had a {what}, and kept it instead.{again}"))
        q = t.quality
        if q is not None and q < LOW_QUALITY and p.get("discarded"):
            played, best = num(p, "turns_to_out_played"), num(p, "turns_to_out_best")
            if played is not None and best is not None and p.get("best_discard"):
                text = (f"Turn {n}: discarding {card(p.get('discarded'))} left you about {played:.1f} turns from "
                        f"going out; discarding {card(p.get('best_discard'))} would have left {best:.1f}.")
            elif p.get("best_discard"):
                text = (f"Turn {n}: discarding {card(p.get('discarded'))} was a weaker choice than "
                        f"discarding {card(p.get('best_discard'))}.")
            else:
                text = f"Turn {n}: discarding {card(p.get('discarded'))} was one of your weaker choices this round."
            facts.append(dict(dimension="reasoning", kind="low_quality_discard", turn_no=n, value=round(q, 2), text=text))
    return facts


def _round_facts(events: list[Event], turns: list[GradedTurn]) -> list[dict]:
    facts = []

    for run in fast_and_wrong_runs(turns, FAST_MS, LOW_QUALITY):
        a, b = run[0].turn_no, run[-1].turn_no
        count = WORDS.get(len(run), str(len(run)))
        facts.append(dict(dimension="speed", kind="fast_and_wrong", turn_no=a, value=len(run),
                          text=f"Turns {a}-{b}: {count} moves in under 1.5 seconds each, and all {count} were "
                               f"below your usual quality."))

    opening = next((t for t in turns if t.payload.get("laid_down")), None)
    if opening:
        melds = [m for m in opening.payload["laid_down"] if isinstance(m, list)]
        points = sum(meld_points(m) for m in melds)
        facts.append(dict(dimension="reasoning", kind="good_opening", turn_no=opening.turn_no, value=points,
                          text=f"Turn {opening.turn_no}: you opened with {points} points using "
                               f"{len(melds)} meld{'s' if len(melds) != 1 else ''}."))

    for e in events:
        p = e.payload
        if e.type == "plan_switch":
            waited = int(num(p, "turns_waited") or 0)
            facts.append(dict(dimension="flexibility", kind="plan_switch", turn_no=p.get("turn_no"), value=waited,
                              text=f"Turn {p.get('turn_no')}: you switched from a {p.get('from')} to a {p.get('to')} "
                                   f"after waiting {waited} turn{'s' if waited != 1 else ''}."))
        elif e.type == "recall_probe" and p.get("correct") is False:
            facts.append(dict(dimension="memory", kind="recall_probe_wrong", turn_no=p.get("turn_no"), value=None,
                              text=f"Turn {p.get('turn_no')}: to the question \"{p.get('question')}\", "
                                   f"your answer was not right."))

    facts += _hint_facts(events)

    graded = [t for t in turns if t.quality is not None]
    if graded:
        best = max(graded, key=lambda t: (t.quality, -t.turn_no))
        if best.quality >= BEST_TURN_MIN_QUALITY:
            what = f"discarding {card(best.payload.get('discarded'))}" if best.payload.get("discarded") else "your move"
            facts.append(dict(dimension="reasoning", kind="best_turn", turn_no=best.turn_no, value=round(best.quality, 2),
                              text=f"Turn {best.turn_no}: {what} was your best decision of the round."))
    return facts


def _hint_facts(events: list[Event]) -> list[dict]:
    by_hint: dict[str, dict] = {}
    for e in events:
        hint_id = e.payload.get("hint_id")
        if e.source == "coach" and hint_id:
            by_hint.setdefault(hint_id, {})[e.type] = e.payload
    facts = []
    for h in by_hint.values():
        followed = h.get("hint_followed", {}).get("followed")
        good = h.get("hint_outcome", {}).get("was_good")
        if not isinstance(followed, bool) or good is not False:
            continue
        turn_no = h.get("hint_requested", {}).get("turn_no")
        conf = num(h.get("hint_shown", {}), "confidence")
        pct = f" ({round(conf * 100)}% confidence)" if conf is not None else ""
        checked = "checked the coach's hint" if "hint_checked" in h else "saw the coach's hint"
        if followed:
            facts.append(dict(dimension="general", kind="hint_followed_bad", turn_no=turn_no, value=conf,
                              text=f"Turn {turn_no}: you followed the coach's hint{pct}, and it turned out "
                                   f"to be a weak move."))
        else:
            facts.append(dict(dimension="general", kind="hint_rejected_bad", turn_no=turn_no, value=conf,
                              text=f"Turn {turn_no}: you {checked}{pct}, ignored it, and your own move was better."))
    return facts


def _profile_delta(session: Session, user_id: str, round_id: str, round_end: datetime) -> dict[str, float]:
    observations = [o for o in load_observations(session, user_id) if o.ts <= round_end or o.ref == round_id]
    mine = [o for o in observations if o.kind == "round" and o.ref == round_id]
    if not mine:
        return {}
    before, after = Twin(), Twin()
    for obs in _ordered(observations):
        after.apply(obs)
        if not (obs.kind == "round" and obs.ref == round_id):
            before.apply(obs)
    return {o.dimension: round(after.beliefs[o.dimension].mu - before.beliefs[o.dimension].mu, 1) for o in mine}


def evidence_for(session: Session, user_id: str, round_id: str) -> EvidenceSheet:
    events = list(session.exec(
        select(Event).where(Event.user_id == user_id, Event.round_id == round_id).order_by(Event.ts, Event.event_id)
    ).all())
    if not events:
        raise LookupError(round_id)
    rami = [e for e in events if e.source == "rami"]
    turns = graded_turns(rami)
    end = next((e.payload for e in rami if e.type == "round_end"), {})

    facts = sorted(_turn_facts(turns) + _round_facts(events, turns),
                   key=lambda f: (f["turn_no"] if isinstance(f["turn_no"], int) else 10**6))
    for i, fact in enumerate(facts, start=1):
        fact["id"] = f"F{i}"

    qualities = [t.quality for t in turns if t.quality is not None]
    thinks = [t.think_ms for t in turns if t.think_ms is not None]
    stats = {
        "turns": num(end, "turns") or float(len(turns)),
        "avg_quality": round(statistics.fmean(qualities), 2) if qualities else None,
        "median_think_ms": float(statistics.median(thinks)) if thinks else None,
        "missed_lay_offs": float(sum(int(num(t.payload.get("missed"), "lay_offs") or 0) for t in turns)),
        "hints_used": float(sum(1 for e in events if e.type == "hint_requested")),
        "user_penalty": num(end, "user_penalty"),
        "ai_penalty": num(end, "ai_penalty"),
    }
    if end.get("abandoned") is True or not end:
        result = "abandoned"
    else:
        result = "win" if end.get("winner") == "user" else "loss"

    end_ts = next((e.ts for e in rami if e.type == "round_end"), events[-1].ts)
    return EvidenceSheet.model_validate({
        "round_id": round_id,
        "user_id": user_id,
        "result": result,
        "facts": facts,
        "stats": {k: v for k, v in stats.items() if v is not None},
        "profile_delta": _profile_delta(session, user_id, round_id, end_ts),
    })


def build_evidence(user_id: str, round_id: str) -> EvidenceSheet:
    with session_scope() as session:
        return evidence_for(session, user_id, round_id)

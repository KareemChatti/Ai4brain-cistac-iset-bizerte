"""Reviews and hint explanations built without the LLM. Used when the API is down, slow or off."""

from .schemas import KeyMoment, NextFocus, Review, Strength

# Order of importance for key moments: the first three come first, as the task pack asks.
NEGATIVE_KINDS = [
    "low_quality_discard",
    "fed_opponent",
    "missed_lay_off",
    "fast_and_wrong",
    "missed_joker_swap",
    "missed_meld",
    "hint_followed_bad",
    "recall_probe_wrong",
]
POSITIVE_KINDS = ["good_opening", "best_turn", "plan_switch", "hint_rejected_bad"]

MOMENT_TEXT = {
    "low_quality_discard": ("A costly discard", "Before you discard, compare the two cards you are least sure about."),
    "fed_opponent": ("Your discard helped your opponent", "Before discarding, check what your opponent picked up in the last two turns."),
    "missed_lay_off": ("A free lay-off left in your hand", "After you open, scan the melds on the table once each turn."),
    "fast_and_wrong": ("Rushing near the end", "When you are close to going out, take one extra breath before each discard."),
    "missed_joker_swap": ("A joker you could have taken", "Look at the jokers on the table: do you hold the card they replace?"),
    "missed_meld": ("A meld you could have laid down", "Before discarding, check your hand once more for a complete set or run."),
    "hint_followed_bad": ("A hint that did not work out", "When the hint's confidence is low, press Check before following it."),
    "recall_probe_wrong": ("A card you did not remember", "Say the opponent's pick-ups to yourself as they happen."),
}

FOCUS_TEXT = {
    "memory": "Next session starts with Card Recall to practise keeping track of played cards.",
    "attention": "Next session starts with Meld Spotter to practise spotting lay-offs and melds.",
    "speed": "Next session starts with Quick Match to practise fast, accurate choices.",
    "reasoning": "Next session starts with a Rami Puzzle to practise choosing the best discard.",
    "flexibility": "Next session starts with Rule Switch to practise changing plans smoothly.",
}

HEADLINES = {
    "win": "Well played, you won this round. Here is what to keep and what to sharpen.",
    "loss": "A close look at this round: a few decisions to sharpen next time.",
    "abandoned": "You stopped this round early. Here is what the moves so far show.",
}


def _rank(kinds: list[str], kind: str) -> int:
    return kinds.index(kind) if kind in kinds else len(kinds)


def build_template_review(evidence: dict) -> Review:
    facts = evidence.get("facts", [])
    negatives = sorted(
        [f for f in facts if f.get("kind") in NEGATIVE_KINDS],
        key=lambda f: (_rank(NEGATIVE_KINDS, f["kind"]), -(f.get("value") or 0)),
    )[:3]
    positives = sorted(
        [f for f in facts if f.get("kind") in POSITIVE_KINDS], key=lambda f: _rank(POSITIVE_KINDS, f["kind"])
    )

    moments = [
        KeyMoment(
            turn_no=f.get("turn_no") or 0,
            title=MOMENT_TEXT[f["kind"]][0],
            explanation=f["text"],
            tip=MOMENT_TEXT[f["kind"]][1],
            fact_ids=[f["id"]],
        )
        for f in sorted(negatives, key=lambda f: f.get("turn_no") or 0)
    ]

    if positives:
        strengths = [Strength(text=positives[0]["text"], fact_ids=[positives[0]["id"]])]
    else:
        strengths = [Strength(text="You played the round through and gave the coach real moves to learn from.", fact_ids=[])]

    focus_fact = next((f for f in negatives if f.get("dimension") in FOCUS_TEXT), None)
    if focus_fact:
        dimension, focus_ids = focus_fact["dimension"], [focus_fact["id"]]
    else:
        delta = evidence.get("profile_delta") or {}
        dimension = min(delta, key=delta.get) if delta else "attention"
        focus_ids = []
    next_focus = NextFocus(dimension=dimension, text=FOCUS_TEXT[dimension], fact_ids=focus_ids)

    if moments:
        spoken = ", ".join(m.title[0].lower() + m.title[1:] for m in moments)
        voice = f"Here is your round in short. The moments to look at: {spoken}. {moments[0].tip}"
    else:
        voice = "Nice round. Nothing costly stood out, so keep playing the same careful way."

    return Review(
        round_id=evidence.get("round_id", ""),
        headline=HEADLINES.get(evidence.get("result", "loss"), HEADLINES["loss"]),
        key_moments=moments,
        strengths=strengths,
        next_focus=next_focus,
        voice_text=voice,
        source="template",
    )


REASON_TEXT = {
    "keeps_run_open": "it keeps a run you are building open",
    "keeps_set_open": "it keeps a set you are building open",
    "opponent_collects_hearts": "your opponent seems to be collecting hearts",
    "opponent_collects": "your opponent seems to be collecting that suit",
    "completes_meld": "it completes a meld",
    "safe_discard": "it is unlikely to help your opponent",
    "high_points": "it lowers the points left in your hand",
    "enables_opening": "it brings you closer to the 71 points you need to open",
}

ACTION_TEXT = {
    "draw_stock": "draw from the stock",
    "draw_discard": "take the top discard",
    "discard": "discard",
    "lay_down": "lay down",
}


def confidence_sentence(confidence: float) -> str:
    pct = round(confidence * 100)
    if pct < 70:
        return f"I'm only {pct}% sure, so check it yourself before you follow it."
    return f"I'm fairly sure ({pct}%), but I can still be wrong."


def build_template_hint_text(hint: dict) -> str:
    action = ACTION_TEXT.get(hint.get("action", ""), "play")
    card = f" {hint['card'].split('.')[0]}" if hint.get("card") else ""
    reasons = [REASON_TEXT.get(c, c.replace("_", " ")) for c in hint.get("reason_codes", [])]
    because = f" because {' and '.join(reasons)}" if reasons else ""
    return f"I suggest you {action}{card}{because}. {confidence_sentence(hint.get('confidence', 0))}"

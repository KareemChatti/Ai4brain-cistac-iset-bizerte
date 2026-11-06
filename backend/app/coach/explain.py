import re

LABEL = {"memory": "Memory", "attention": "Attention", "speed": "Speed", "reasoning": "Reasoning", "flexibility": "Flexibility"}

WHY_RE = re.compile(
    r"\bwhy\b.*\b(today|plan|exercise|task|focus|assign\w*|chose|choose|picked|round|this)\b"
    r"|\bwhat\b.*\breason\b.*\b(plan|exercise|focus)\b",
    re.IGNORECASE,
)
FUTURE_RE = re.compile(
    r"\b(next (week|month|year)|in \d+ (days|weeks|months)|future|predict\w*|forecast|will (my|i)|what will|going to be)\b",
    re.IGNORECASE,
)


def is_why_question(message: str) -> bool:
    return bool(WHY_RE.search(message))


def is_future_question(message: str) -> bool:
    return bool(FUTURE_RE.search(message))


def mentioned_dimension(message: str) -> str | None:
    text = message.lower()
    return next((d for d in LABEL if d in text), None)


def _trend_text(e: dict) -> str:
    trend = e.get("trend") or 0
    if abs(trend) < 0.5:
        return "it has not moved this week"
    direction = "gone up" if trend > 0 else "gone down"
    return f"it has {direction} by {abs(trend):.1f} points this week"


def explain_plan(plan: dict | None, profile: dict | None) -> str | None:
    if not plan or not profile or not profile.get("dimensions"):
        return None
    dims = profile["dimensions"]
    focus = plan["focus"]
    e = dims.get(focus)
    if not e:
        return None
    strongest = max(dims, key=lambda d: dims[d]["score"])
    s = dims[strongest]
    level = plan.get("opponent_level")
    parts = [
        f"I chose {LABEL[focus]} for today because of your Brain Twin data.",
        f"Your {focus} score is {round(e['score'])}, with a range of {round(e['low'])} to {round(e['high'])} "
        f"from {e.get('n_obs', 0)} measurements, and {_trend_text(e)}.",
        f"I pick the skill that is lowest or least certain, and {focus} needs the most work right now.",
    ]
    if strongest != focus:
        parts.append(f"For comparison, your strongest skill is {strongest} at {round(s['score'])}.")
    if level:
        parts.append(f"Your opponent is set to level {level} based on your recent results.")
    return " ".join(parts)


def explain_future(message: str, projection: dict | None, profile: dict | None) -> str:
    if not projection or not projection.get("points"):
        return ("I can't tell you an exact future score, nobody can. Play a few more rounds and I can show you "
                "a likely range, not a promise.")
    points = projection["points"]
    weeks = projection.get("weeks", 4)
    per_week = projection.get("sessions_per_week", 3)
    dims = (profile or {}).get("dimensions", {})
    dim = mentioned_dimension(message) or (min(dims, key=lambda d: dims[d]["score"]) if dims else points[0]["dimension"])
    now = next((p for p in points if p["dimension"] == dim and p["week"] == 0), None)
    later = next((p for p in points if p["dimension"] == dim and p["week"] == weeks), None)
    if not now or not later:
        return "I can't tell you an exact future score. I can only estimate a range from your own progress."
    return (
        f"I can't tell you an exact score for next month, and I won't pretend to. "
        f"Your {dim} is about {round(now['score'])} today (range {round(now['low'])} to {round(now['high'])}). "
        f"If you keep playing about {per_week} times a week, in {weeks} weeks it is likely to be between "
        f"{round(later['low'])} and {round(later['high'])}. "
        f"{projection.get('disclaimer', 'This is an estimate, not a prediction of ability.')}"
    )

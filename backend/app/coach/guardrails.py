import re

from pydantic import ValidationError

from .schemas import Review

BLOCKED_PATTERNS = [
    r"diagnos\w*",
    r"disorders?",
    r"d[ée]ficits?",
    r"impairments?",
    r"adhd",
    r"dementia",
    r"alzheimer\w*",
    r"autis\w*",
    r"dyslexi\w*",
    r"diseases?",
    r"symptoms?",
    r"sympt[ôo]mes?",
    r"patients?",
    r"treatments?",
    r"traitements?",
    r"therap\w*",
    r"th[ée]rapie\w*",
    r"clinical\w*",
    r"clinique\w*",
    r"cognitive decline",
    r"d[ée]clin cognitif",
    r"iq",
    r"qi",
    r"abnormal\w*",
    r"anormal\w*",
    r"low intelligence",
    r"slow learner",
    r"brain damage",
    r"maladie\w*",
    r"mard",
]
BLOCKED_RE = re.compile(r"\b(" + "|".join(BLOCKED_PATTERNS) + r")\b", re.IGNORECASE)

BLOCKED_TERMS_FOR_PROMPT = (
    "diagnosis, disorder, deficit, impairment, ADHD, dementia, Alzheimer, autism, dyslexia, disease, symptom, "
    "patient, treatment, therapy, clinical, cognitive decline, IQ, abnormal, low intelligence, slow learner, "
    "brain damage"
)


def find_blocked(text: str) -> list[str]:
    return sorted({m.group(0).lower() for m in BLOCKED_RE.finditer(text or "")})


def review_texts(review: Review) -> list[str]:
    texts = [review.headline, review.voice_text, review.next_focus.text]
    for m in review.key_moments:
        texts += [m.title, m.explanation, m.tip]
    texts += [s.text for s in review.strengths]
    return texts


def check_review(raw: dict | Review, evidence: dict) -> tuple[Review | None, list[str]]:
    problems: list[str] = []
    try:
        review = raw if isinstance(raw, Review) else Review.model_validate(raw)
    except ValidationError as e:
        return None, [f"invalid shape: {e.error_count()} errors"]
    review = review.model_copy(deep=True)

    known = {f["id"] for f in evidence.get("facts", [])}

    def cited_ok(ids: list[str]) -> bool:
        return bool(ids) and all(i in known for i in ids)

    kept_moments = []
    for m in review.key_moments:
        if cited_ok(m.fact_ids):
            kept_moments.append(m)
        else:
            problems.append(f"dropped key moment (turn {m.turn_no}) citing {m.fact_ids or 'no fact'}")
    review.key_moments = kept_moments[:3]
    if len(kept_moments) > 3:
        problems.append("trimmed key moments to 3")

    kept_strengths = []
    for s in review.strengths:
        if cited_ok(s.fact_ids):
            kept_strengths.append(s)
        else:
            problems.append(f"dropped strength citing {s.fact_ids or 'no fact'}")
    review.strengths = kept_strengths

    fatal = False
    if not cited_ok(review.next_focus.fact_ids):
        problems.append(f"next focus cites {review.next_focus.fact_ids or 'no fact'}")
        fatal = True
    if not review.strengths:
        problems.append("no supported strength")
        fatal = True

    blocked = sorted({w for t in review_texts(review) for w in find_blocked(t)})
    if blocked:
        problems.append(f"blocked words: {', '.join(blocked)}")
        fatal = True

    return (None if fatal else review), problems

"""Coach endpoints (docs/contracts.md section 5). Member 2's app/main.py includes this router with one line:

    from app.coach.router import router as coach_router
    app.include_router(coach_router)
"""

import logging
import re
import time

from fastapi import APIRouter, HTTPException

from . import cache, data, prompts
from .guardrails import check_review, find_blocked
from .llm import DEFAULT_TIMEOUT_S, LLMUnavailable, complete_json
from .schemas import (
    ChatAnswer,
    ChatRequest,
    ChatResponse,
    ExplainHintRequest,
    ExplainHintResponse,
    HintText,
    Review,
    ReviewDraft,
    ReviewRequest,
)
from .template import build_template_hint_text, build_template_review, confidence_sentence

log = logging.getLogger("coach")
router = APIRouter(prefix="/api/coach", tags=["coach"])


def generate_review(evidence: dict, language: str = "en") -> tuple[Review, list[str]]:
    """LLM review with guardrails, one retry, then the template. Total LLM time stays under 15 s."""
    problems: list[str] = []
    deadline = time.monotonic() + DEFAULT_TIMEOUT_S
    for attempt in (1, 2):
        remaining = deadline - time.monotonic()
        if remaining < 2:
            problems.append("no time left for another try")
            break
        try:
            draft = complete_json(
                prompts.review_system(language), prompts.review_user(evidence), ReviewDraft, timeout=remaining
            )
        except LLMUnavailable as e:
            problems.append(f"attempt {attempt}: {e}")
            if "timeout" in str(e) or "not set" in str(e) or "disabled" in str(e):
                break  # retrying would not help
            continue
        candidate = {**draft.model_dump(), "round_id": evidence["round_id"], "source": "llm"}
        review, found = check_review(candidate, evidence)
        problems += [f"attempt {attempt}: {p}" for p in found]
        if review is not None:
            return review, problems
    return build_template_review(evidence), problems


@router.post("/review", response_model=Review)
def review_round(body: ReviewRequest) -> Review:
    cached = cache.get_cached(body.round_id)
    if cached is not None:
        return cached
    try:
        evidence = data.get_evidence(body.user_id, body.round_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="round not found")
    review, problems = generate_review(evidence)
    if problems:
        log.info("review %s: %s", body.round_id, "; ".join(problems))
    if review.source == "llm":
        cache.put_cached(body.user_id, review)
    return review


@router.post("/explain-hint", response_model=ExplainHintResponse)
def explain_hint(body: ExplainHintRequest) -> ExplainHintResponse:
    hint = body.hint.model_dump()
    try:
        out = complete_json(
            prompts.explain_hint_system(body.language),
            prompts.explain_hint_user(hint, body.state_summary),
            HintText,
        )
        text = out.text.strip()
        if find_blocked(text) or not text:
            raise LLMUnavailable("blocked words in hint text")
        if f"{round(body.hint.confidence * 100)}%" not in text:
            text = f"{text} {confidence_sentence(body.hint.confidence)}"
    except LLMUnavailable as e:
        log.info("explain-hint fallback: %s", e)
        text = build_template_hint_text(hint)
    return ExplainHintResponse(text=text)


EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\s.-]?){8,14}\d(?!\d)")
NAME_RE = re.compile(
    r"\b(my name is|i am called|je m'appelle|je suis|ismi|esmi)\s+[A-ZÀ-Ý][\w'-]+\s+[A-ZÀ-Ý][\w'-]+",
    re.IGNORECASE,
)

PERSONAL_DATA_REPLY = (
    "Please don't share personal details like your name, email or phone number here. "
    "I only need your games to help you, so let's talk about those."
)


def contains_personal_data(message: str) -> bool:
    return bool(EMAIL_RE.search(message) or PHONE_RE.search(message) or NAME_RE.search(message))


def _fallback_chat(profile: dict | None) -> str:
    if not profile:
        return "I don't know much about you yet. Play a round and ask me again."
    dims = profile.get("dimensions", {})
    if not dims:
        return "I don't know much about you yet. Play a round and ask me again."
    low = min(dims, key=lambda d: dims[d]["score"])
    e = dims[low]
    return (
        f"Your {low} score is {round(e['score'])} (range {round(e['low'])}-{round(e['high'])}), "
        f"which has the most room to grow right now. Today's plan starts there."
    )


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest) -> ChatResponse:
    # Never send personal data to the LLM, and never store the message text.
    if contains_personal_data(body.message):
        return ChatResponse(reply=PERSONAL_DATA_REPLY, fact_ids=[], contains_personal_data=True)
    profile = data.get_profile(body.user_id)
    evidence = data.recent_evidence(body.user_id, n=3)
    known = {f["id"] for sheet in evidence for f in sheet.get("facts", [])}
    try:
        answer = complete_json(prompts.chat_system(profile, evidence, body.language), body.message, ChatAnswer)
        if find_blocked(answer.reply):
            raise LLMUnavailable("blocked words in chat reply")
        return ChatResponse(reply=answer.reply, fact_ids=[i for i in answer.fact_ids if i in known])
    except LLMUnavailable as e:
        log.info("chat fallback: %s", e)
        return ChatResponse(reply=_fallback_chat(profile), fact_ids=[])

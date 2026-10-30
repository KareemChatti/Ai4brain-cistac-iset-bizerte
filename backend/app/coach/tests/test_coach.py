import copy
import json
import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.coach import router as coach_router
from app.coach.guardrails import check_review, find_blocked
from app.coach.llm import LLMUnavailable
from app.coach.schemas import ReviewDraft
from app.coach.template import build_template_hint_text, build_template_review

FIXTURES = Path(__file__).resolve().parents[4] / "shared" / "fixtures"
EVIDENCE = json.loads((FIXTURES / "evidence.json").read_text())
REVIEW = json.loads((FIXTURES / "review.json").read_text())
USER = EVIDENCE["user_id"]
ROUND = EVIDENCE["round_id"]


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(coach_router.router)
    return TestClient(app)


def draft_from(review: dict) -> ReviewDraft:
    return ReviewDraft.model_validate({k: v for k, v in review.items() if k not in ("round_id", "source")})


# ---------- guardrails ----------
def test_fixture_review_passes_guardrails():
    review, problems = check_review(REVIEW, EVIDENCE)
    assert review is not None
    assert problems == []


def test_guardrails_remove_item_citing_unknown_fact():
    bad = copy.deepcopy(REVIEW)
    bad["key_moments"][0]["fact_ids"] = ["F99"]
    bad["strengths"].append({"text": "Something made up.", "fact_ids": []})
    review, problems = check_review(bad, EVIDENCE)
    assert review is not None
    assert all("F99" not in m.fact_ids for m in review.key_moments)
    assert len(review.key_moments) == len(REVIEW["key_moments"]) - 1
    assert len(review.strengths) == len(REVIEW["strengths"])
    assert any("F99" in p for p in problems)


def test_review_with_blocked_word_is_rejected():
    bad = copy.deepcopy(REVIEW)
    bad["headline"] = "Your memory deficit cost you this round."
    review, problems = check_review(bad, EVIDENCE)
    assert review is None
    assert any("deficit" in p for p in problems)


def test_blocked_words_need_whole_words():
    assert find_blocked("A unique, therapeutic idea") == ["therapeutic"]
    assert find_blocked("Your IQ") == ["iq"]
    assert find_blocked("a unique move") == []


def test_unsupported_next_focus_is_rejected():
    bad = copy.deepcopy(REVIEW)
    bad["next_focus"]["fact_ids"] = []
    review, _ = check_review(bad, EVIDENCE)
    assert review is None


# ---------- template ----------
def test_template_review_cites_only_real_facts():
    review = build_template_review(EVIDENCE)
    assert review.source == "template"
    assert [m.turn_no for m in review.key_moments] == [7, 9, 11]  # the three priority kinds, in turn order
    checked, problems = check_review(review, EVIDENCE)
    assert checked is not None, problems
    assert not re.search(r"\b[2-9TJQKA][SHDC]\b", review.voice_text)  # no card codes when spoken


def test_template_review_without_facts():
    review = build_template_review({"round_id": "r", "result": "win", "facts": [], "profile_delta": {"speed": -1}})
    assert review.key_moments == []
    assert review.next_focus.dimension == "speed"


def test_template_hint_is_honest_about_confidence():
    text = build_template_hint_text(
        {"hint_id": "h", "action": "discard", "card": "8H.1", "confidence": 0.55, "reason_codes": ["keeps_run_open"]}
    )
    assert "8H" in text and "8H.1" not in text
    assert "55%" in text


# ---------- endpoints ----------
def test_review_endpoint_uses_template_when_llm_disabled(client):
    r = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "template"
    assert body["round_id"] == ROUND
    assert body["key_moments"]


def test_review_retries_once_then_uses_llm_answer(client, monkeypatch):
    bad = copy.deepcopy(REVIEW)
    bad["voice_text"] = "This is not a diagnosis."
    answers = [draft_from(bad), draft_from(REVIEW)]
    calls = []

    def fake(system, user, schema, timeout=15):
        calls.append(schema)
        return answers.pop(0)

    monkeypatch.setattr(coach_router, "complete_json", fake)
    r = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND})
    assert r.json()["source"] == "llm"
    assert len(calls) == 2

    # Cached: a refresh does not call the LLM again.
    r2 = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND})
    assert r2.json() == r.json()
    assert len(calls) == 2


def test_review_falls_back_after_two_bad_answers(client, monkeypatch):
    bad = copy.deepcopy(REVIEW)
    bad["headline"] = "A clinical look at your round."
    monkeypatch.setattr(coach_router, "complete_json", lambda *a, **k: draft_from(bad))
    r = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND})
    assert r.json()["source"] == "template"


def test_review_does_not_retry_on_timeout(client, monkeypatch):
    calls = []

    def slow(*a, **k):
        calls.append(1)
        raise LLMUnavailable("timeout after 15s")

    monkeypatch.setattr(coach_router, "complete_json", slow)
    r = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND})
    assert r.json()["source"] == "template"
    assert len(calls) == 1


def test_explain_hint_fallback(client):
    hint = {"hint_id": "h1", "action": "discard", "card": "QD.2", "confidence": 0.55, "reason_codes": ["safe_discard"]}
    r = client.post("/api/coach/explain-hint", json={"user_id": USER, "hint": hint, "state_summary": {}})
    assert r.status_code == 200
    assert "55%" in r.json()["text"]


@pytest.mark.parametrize(
    "message",
    ["my email is sami@example.com", "call me on +216 22 123 456", "My name is Sami Ben Ali, what should I train?"],
)
def test_chat_flags_personal_data(client, message):
    r = client.post("/api/coach/chat", json={"user_id": USER, "message": message})
    body = r.json()
    assert body["contains_personal_data"] is True
    assert "personal" in body["reply"]


def test_chat_fallback_answers_from_profile(client, monkeypatch):
    from app.coach import data

    monkeypatch.setattr(data, "get_profile", lambda user_id: json.loads((FIXTURES / "profile.json").read_text()))
    r = client.post("/api/coach/chat", json={"user_id": USER, "message": "What should I work on?"})
    body = r.json()
    assert body["contains_personal_data"] is False
    assert "reasoning" in body["reply"]  # lowest score in the profile fixture


def test_data_uses_member2_profile_helpers():
    from app.coach import data

    assert data._m2("get_profile") is not None
    assert data._m2("recent_round_ids") is not None


# ---------------- local model through Ollama ----------------
import io  # noqa: E402
import json as _json  # noqa: E402
import urllib.error  # noqa: E402

from app.coach import llm  # noqa: E402
from app.coach.schemas import ReviewDraft  # noqa: E402


class _FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _ollama(monkeypatch, reply=None, error=None, capture=None):
    """Replace the HTTP call to Ollama: return `reply` as the model's message, or raise `error`."""
    monkeypatch.delenv("COACH_LLM_DISABLED", raising=False)
    monkeypatch.setenv("COACH_PROVIDER", "ollama")

    def fake_urlopen(request, timeout):
        if capture is not None:
            capture.append(_json.loads(request.data.decode()) if request.data else None)
        if error:
            raise error
        return _FakeResponse(_json.dumps(reply).encode())

    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen)


def _valid_draft() -> dict:
    return {
        "headline": "A close round.",
        "key_moments": [{"turn_no": 7, "title": "Fed the opponent", "explanation": "8H helped them.",
                         "tip": "Watch what they pick up.", "fact_ids": ["F1"]}],
        "strengths": [{"text": "A good opening.", "fact_ids": ["F5"]}],
        "next_focus": {"dimension": "memory", "text": "Track discards.", "fact_ids": ["F1"]},
        "voice_text": "A close round. Watch what your opponent picks up.",
    }


def test_provider_defaults_to_ollama_without_a_key(monkeypatch):
    monkeypatch.delenv("COACH_PROVIDER", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert llm.provider() == "ollama"
    assert llm.model_name() == llm.DEFAULT_OLLAMA_MODEL
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    assert llm.provider() == "anthropic"
    monkeypatch.setenv("COACH_PROVIDER", "ollama")
    assert llm.provider() == "ollama"


def test_ollama_reply_is_parsed_and_the_schema_is_sent_inline(monkeypatch):
    sent = []
    _ollama(monkeypatch, reply={"message": {"content": _json.dumps(_valid_draft())}, "done": True}, capture=sent)

    draft = llm.complete_json("system", "user", ReviewDraft, timeout=5)

    assert draft.headline == "A close round."
    body = sent[0]
    assert body["stream"] is False and body["model"] == llm.model_name()
    assert "$ref" not in _json.dumps(body["format"])  # refs expanded for small local models
    assert body["format"]["properties"]["key_moments"]["items"]["properties"]["fact_ids"]


def test_ollama_not_running_is_reported_clearly(monkeypatch):
    _ollama(monkeypatch, error=urllib.error.URLError(ConnectionRefusedError()))
    with pytest.raises(llm.LLMUnavailable, match="not running"):
        llm.complete_json("s", "u", ReviewDraft, timeout=5)


def test_missing_model_says_how_to_install_it(monkeypatch):
    _ollama(monkeypatch, error=urllib.error.HTTPError("u", 404, "not found", {}, None))
    with pytest.raises(llm.LLMUnavailable, match="ollama pull"):
        llm.complete_json("s", "u", ReviewDraft, timeout=5)


def test_ollama_timeout_and_bad_json_fall_back(monkeypatch):
    _ollama(monkeypatch, error=TimeoutError())
    with pytest.raises(llm.LLMUnavailable, match="timeout"):
        llm.complete_json("s", "u", ReviewDraft, timeout=5)
    _ollama(monkeypatch, reply={"message": {"content": "not json at all"}})
    with pytest.raises(llm.LLMUnavailable, match="invalid JSON"):
        llm.complete_json("s", "u", ReviewDraft, timeout=5)


def test_review_from_ollama_passes_the_guardrails(client, monkeypatch):
    _ollama(monkeypatch, reply={"message": {"content": _json.dumps(_valid_draft())}})
    review = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND}).json()
    assert review["source"] == "llm"
    assert review["key_moments"][0]["fact_ids"] == ["F1"]


def test_review_from_ollama_with_invented_facts_is_cleaned(client, monkeypatch):
    bad = _valid_draft()
    bad["key_moments"][0]["fact_ids"] = ["F99"]  # a fact that is not in the evidence sheet
    _ollama(monkeypatch, reply={"message": {"content": _json.dumps(bad)}})
    review = client.post("/api/coach/review", json={"user_id": USER, "round_id": ROUND}).json()
    assert all("F99" not in m["fact_ids"] for m in review["key_moments"])

# `backend/app/coach/`: AI coach service

**Owner:** Member 3 (coach & dashboard). Spec: [`docs/team/member-3-coach.md`](../../../docs/team/member-3-coach.md) task 3.2

| File | What it does |
|---|---|
| `router.py` | `POST /api/coach/review`, `/explain-hint`, `/chat` |
| `llm.py` | `complete_json(system, user, schema_model)`: the only call to the LLM provider (Anthropic SDK, structured outputs, 15 s timeout) |
| `prompts.py` | review, explain-hint and chat system prompts |
| `guardrails.py` | schema check, drops items citing missing facts, blocked clinical words |
| `template.py` | review and hint text without the LLM (`source: "template"`) |
| `data.py` | reads M2's `build_evidence`, `get_profile`, `recent_round_ids`; falls back to `shared/fixtures/` until they exist |
| `cache.py` | `CoachReview` table (one LLM review per round) |

**Review flow:** evidence sheet → LLM → guardrails → one retry → template. The whole LLM budget is 15 s, and a timeout goes straight to the template so the demo never hangs.

**For Member 2:**
- In `app/main.py`: `from app.coach.router import router as coach_router` then `app.include_router(coach_router)`.
- Add the lines of `requirements.txt` here to `backend/requirements.txt`.
- In `DELETE /api/data/{user_id}`, also call `app.coach.cache.delete_user(user_id)`.

**Env** (`backend/.env`): `ANTHROPIC_API_KEY`, optional `COACH_MODEL` (default `claude-sonnet-5-5`). `COACH_LLM_DISABLED=1` forces the template (tests use it).

**Tests:** `cd backend && python -m pytest app/coach`

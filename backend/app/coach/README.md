# `backend/app/coach/`: AI coach service

**Owner:** Member 3 (coach & dashboard)

FastAPI router included by `backend/app/main.py` (guarded import, so the server starts even if this folder is empty). LLM call behind `llm.py`, prompts, guardrails, template fallback.

It may read data only through Member 2's functions: `build_evidence(user_id, round_id)`, `get_profile(user_id)`, `recent_round_ids(user_id, n=3)`.

Spec: [`docs/team/member-3-coach.md`](../../../../docs/team/member-3-coach.md) task 3.2

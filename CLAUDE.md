# AI4Brain × Rami

Entry for the CISTAC 1.0 AI4Brain challenge (official brief: @docs/challenge-brief.md, PDF in `docs/challenge-brief.pdf`).
A Tunisian Rami card game turned into a cognitive coach, on the chess.com model: play rounds against an AI opponent, a grader scores each *decision* (not luck), five mini-games measure one ability each, a Brain Twin keeps an uncertainty-aware profile over time, and an LLM coach explains results using only recorded evidence.

Deadlines: Integration 1 on Oct 25, feature freeze Oct 29, Phase 1 submission **Nov 1 2026**, pitch Nov 7 2026.

## Source of truth
- The shared contract is @docs/contracts.md. Every endpoint, event payload and response shape must match it exactly; `shared/types.ts` is the same contract in TypeScript and `shared/fixtures/*.json` are samples in that exact format.
- Never change `docs/contracts.md` or `shared/` on your own: propose the change, get one teammate's "ok", then edit and add a changelog line.
- Task packs per member are in `docs/team/`.

## Folder ownership (write only in your own folders)
- **M1, game:** `frontend/src/engine/`, `frontend/src/game/`, `frontend/src/minigames/`, `docs/rami-rules.md`
- **M2, data & Brain Twin:** `backend/` except `backend/app/coach/`, `docs/scoring.md`, `docs/data-and-ethics.md`
- **M3, coach & dashboard:** `frontend/src/app/`, `api/`, `coach/`, `dashboard/`, `onboarding/`, `backend/app/coach/`, `README.md`

## Stack (fixed)
- Frontend: Vite + React 18 + TypeScript, Tailwind, Zustand, React Router, Recharts, Vitest.
- Backend: Python 3.11, FastAPI, SQLModel + SQLite (`backend/data.db`), Pydantic v2, numpy, pytest, uvicorn.
- Coach LLM: Anthropic Python SDK behind one function (`backend/app/coach/llm.py`), model from env `COACH_MODEL`.

## Rules that protect the score
- Non-clinical everywhere: never diagnose; no words like disorder, deficit, IQ, symptom, patient (full list in `docs/team/member-3-coach.md`).
- Every score is shown with its range (score, low, high, n_obs); projections always carry the disclaimer, never a certainty.
- The coach may only state facts present in the evidence sheet and must cite fact ids.
- No camera, microphone, real names or contact details are stored; only a nickname.

## Workflow
- Branches `m1-game`, `m2-twin`, `m3-coach`; pull requests into `main` at least every 2 days.
- Each owner writes tests for their own code; backend tests load `shared/fixtures/events-round.json`.
- Run backend: `uvicorn app.main:app --reload` from `backend/`. Frontend: `npm run dev` with `VITE_USE_MOCK=true` until the backend is up.

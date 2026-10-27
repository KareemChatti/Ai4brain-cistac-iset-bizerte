# `backend/`: API, data and Brain Twin

**Owner:** Member 2 (data & Brain Twin), except `app/coach/` (Member 3)

Python 3.11 · FastAPI · SQLModel + SQLite · Pydantic v2 · numpy · pytest

## Run the backend

```bash
cd backend
python -m venv .venv                  # Python 3.11
source .venv/bin/activate             # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                  # optional: FRONTEND_URL, ANTHROPIC_API_KEY...
uvicorn app.main:app --reload         # http://localhost:8000
```

- Interactive API docs: <http://localhost:8000/docs>
- Health check: `GET /api/health`
- The database is the file `backend/data.db`, created on first start. Delete it to start from scratch (it is git-ignored).

Try it with the sample round:

```bash
curl -X POST localhost:8000/api/events -H "Content-Type: application/json" \
     --data @../shared/fixtures/events-round.json
curl localhost:8000/api/data/11111111-1111-4111-8111-111111111111/export
```

## Tests

```bash
cd backend
python -m pytest
```

Every test runs on a fresh in-memory database. `tests/test_contract.py` checks that the schemas accept every sample in `shared/fixtures/`, so a contract drift fails CI.

## Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///backend/data.db` | Any SQLAlchemy URL (Postgres works too) |
| `FRONTEND_URL` | none | Deployed frontend origin(s) for CORS, comma-separated. `localhost:5173` is always allowed |
| `RETENTION_DAYS` | `90` | Events older than this are deleted (task 2.7) |
| `ANTHROPIC_API_KEY`, `COACH_MODEL` | none | Used by the coach (Member 3) |

## Behaviour worth knowing

**`POST /api/events`**
- Validates the whole batch against the contract first. One malformed event rejects the batch with `422` and the error says which event and field, so mismatches show up during development.
- Safe to retry: an `event_id` already stored is skipped. `accepted` counts every valid event in the batch, new or already stored, so the client can drop them all from its buffer.
- Accepts `text/plain` bodies too, so `navigator.sendBeacon` on page hide works without a CORS preflight.
- Creates the user row on first sight if the frontend never called `POST /api/users` (e.g. tests with fixtures).
- At most 500 events per batch.
- Scoring runs after the events are committed. A scoring error is logged and never loses events.

**`POST /api/users`** stores a nickname only. Anything that looks like an email, phone number or link is rejected with `422`.

**`DELETE /api/data/{user_id}`** removes every row in every table with a `user_id` column, so tables added later (including the coach's cached reviews) are covered automatically. A SHA-256 hash of the id is kept as a tombstone so that events arriving late (a beacon sent after the deletion) are dropped instead of recreating the user. Calling it twice is safe.

**`GET /api/data/{user_id}/export`** returns the user and every row from those same tables as one JSON file.

## Layout

```
backend/
├── app/
│   ├── main.py         app, CORS, beacon support, routers, guarded coach import
│   ├── config.py       settings from the environment
│   ├── db.py           engine, sessions (get_session for routes, session_scope for plain functions)
│   ├── models.py       tables: users, events, observations, snapshots, goals, deleted_users
│   ├── schemas.py      request/response shapes from docs/contracts.md
│   ├── privacy.py      nickname check, user-id hashing
│   ├── timeutil.py     UTC helpers, ISO "Z" formatting
│   ├── routers/        users, events, profile, data  (plan, collab... coming)
│   ├── scoring/        observations (events -> 0-100), twin (Kalman belief), pipeline, profile
│   │                   (projection, adaptive, collab, frustration coming)
│   └── coach/          Member 3
└── tests/
```

## For the coach (Member 3)

- Include your router as `app/coach/router.py` exporting `router`. `main.py` imports it inside a `try`, so the server still starts if it is missing or broken.
- Open your own session with `from app.db import session_scope`.
- Give your cached-review table a `user_id` column and export/delete will include it with no change on my side.
- Ready: `from app.scoring.profile import get_profile, recent_round_ids`
  - `get_profile(user_id) -> Profile` (Pydantic model, same shape as `GET /api/profile/{id}`)
  - `recent_round_ids(user_id, n=3) -> list[str]`, newest first
- Coming in task 2.6: `build_evidence(user_id, round_id)`.

## How scoring works

Every batch of events re-scores the rounds and mini-game sessions it touches into 0–100 observations, then replays the Brain Twin (one Kalman belief per skill) and rewrites the snapshot history. Formulas, parameters and limitations: [`docs/scoring.md`](../docs/scoring.md).

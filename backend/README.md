# `backend/`: API, data and Brain Twin

**Owner:** Member 2 (data & Brain Twin), except `app/coach/` (Member 3)

Python 3.11 · FastAPI · SQLModel + SQLite · Pydantic v2 · numpy · pytest

```
backend/
├── app/
│   ├── main.py        app, CORS, routers
│   ├── db.py          engine and sessions (SQLite file backend/data.db)
│   ├── models.py      tables and response schemas
│   ├── routers/       users, events, profile, plan, collab, data
│   ├── scoring/       observations, twin, projection, adaptive, collab, frustration
│   ├── evidence.py    evidence sheet for the coach
│   └── coach/         Member 3
└── tests/
```

Run instructions are added with task 2.1. Spec: [`docs/team/member-2-twin.md`](../docs/team/member-2-twin.md)

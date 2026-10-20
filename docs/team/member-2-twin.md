# Member 2: Data & Brain Twin

**You build:** the backend server, the database, scoring with uncertainty, the Brain Twin (history and projection), adaptive difficulty and the training plan, the AI Collaboration Score, frustration detection, the evidence sheet for the coach, and the consent, export and delete features. You also create the repo on day 1.
**You own:** `backend/` (except `backend/app/coach/`, which is M3's), `docs/scoring.md`.
**You never edit:** the frontend. You test with the files in `shared/fixtures/`.

## Technologies
- Python 3.11, FastAPI, uvicorn
- SQLModel (SQLAlchemy + Pydantic) on SQLite (one file, `backend/data.db`), easy to switch to Postgres later
- numpy for the maths, pytest + httpx `TestClient` for tests
- python-dotenv for settings; CORS middleware so the frontend can call you
- Deployment for the demo: Render or Railway free tier, or run locally

## How to use the prompts
Paste each prompt into your AI coding assistant **from the repo root**, so it can read `docs/contracts.md`, `shared/types.ts` and `shared/fixtures/`. Do the tasks in order, test, commit after each one.

---

## Task 2.0: Create the repo (Oct 19–20, do this first, everyone waits on it)
1. Create a public GitHub repo `ai4brain-rami`, add the other two as collaborators.
2. Copy this starter kit into it (`docs/`, `shared/`).
3. Create the empty folders from contracts section 2 with a `README.md` in each saying who owns it.
4. Add `.gitignore` (node_modules, .env, `*.db`, `__pycache__`), and an MIT `LICENSE`.
5. Protect `main`: changes go through pull requests. Post the link in the team chat.

---

## Task 2.1: Server, database, events (Oct 20–22)

**Prompt:**
```
Read docs/contracts.md and shared/types.ts. Create a FastAPI backend in backend/ (Python 3.11): app/main.py with
CORS for http://localhost:5173 and the deployed frontend URL from env FRONTEND_URL, app/db.py (SQLModel + SQLite
file backend/data.db), app/models.py with tables User(user_id, nickname, created_at, consent_version,
consent_at, analytics), Event(event_id PK, user_id FK, session_id, round_id, ts, source, type, payload JSON,
received_at), Snapshot(id, user_id, ts, trigger, dimensions JSON), Goal(id, user_id, dimension, target, created_at),
and Pydantic schemas matching every response shape in docs/contracts.md section 6.
Routers in app/routers/: users.py (POST /api/users, POST /api/consent), events.py (POST /api/events: validate each
event, ignore duplicates by event_id, store, then call app.scoring.pipeline.on_new_events(user_id, events) which
for now does nothing), data.py (GET /api/data/{user_id}/export returns the user, all events, snapshots and goals
as JSON; DELETE /api/data/{user_id} deletes everything for that user and returns {deleted: true}).
Write pytest tests that post shared/fixtures/events-round.json and check all 18 events are stored, that posting
twice stores them once, and that delete leaves zero rows for the user. Add backend/requirements.txt and a
README section "Run the backend".
```
**Done when:** tests pass and `uvicorn app.main:app --reload` accepts the fixture batch.

---

## Task 2.2: Scoring with uncertainty (Oct 22–24) ← the heart of layer A

**The model (write it in `docs/scoring.md`, it goes in the report):**
Each dimension has a belief about the user's true score θ, stored as a normal distribution with mean μ and standard deviation σ on a 0–100 scale.
- **Start:** μ = 50, σ = 25 (we know nothing).
- **Each observation** `x` (a 0–100 score from one mini-game or one round) has its own noise `r`: mini-game r = 12, in-game signal r = 25 (games are noisier because of luck and many skills at once).
- **Update (Kalman filter):** `K = σ² / (σ² + r²)`, `μ ← μ + K(x − μ)`, `σ² ← (1 − K)σ²`.
- **Drift:** before each update, `σ² ← σ² + q²·days_since_last` with q = 2, so the twin stays able to change over time.
- **Displayed range:** `μ ± 1.96σ`, clipped to 0–100. "Memory 68% ± 6" means a 95% range of 62–74.

**Turning raw results into 0–100 observations** (placeholder references, tune them on your own pilot data and say so in the report):

| Dimension | From the mini-game | From Rami rounds |
|---|---|---|
| memory | `card_recall`: (span_reached − 2) / 7 × 100 | recall_probe accuracy × 100; minus 10 per `fed_opponent` |
| attention | `meld_spotter`: (hit rate − false-alarm rate) × 100 at level, + 5 × level | 100 × (1 − missed / (missed + used)) over lay-offs, joker swaps, melds |
| speed | `quick_match`: correct per minute / 40 × 100 (cap 100) | 100 × clamp(1 − (median think_ms per option − 300) / 1500) |
| reasoning | `rami_puzzle`: accuracy × 60 + level × 4 | mean turn `quality` × 100 (from `turn_graded`) |
| flexibility | `rule_switch`: 100 − 12 × mean trials_to_adapt (min 0) | 100 − 20 × mean turns_waited in `plan_switch` |

**Prompt:**
```
Read docs/contracts.md. In backend/app/scoring/ implement:
observations.py: functions that turn stored events into observations (dimension, value 0-100, noise r, ts) with
exactly these mappings: [paste the table above]. Mini-game observations use r=12 and are produced on minigame_end;
in-game observations use r=25 and are produced on round_end (reasoning waits for turn_graded events; recompute
when they arrive).
twin.py: class DimensionBelief(mu=50, sigma=25) with drift(days, q=2) and update(x, r) implementing the Kalman
update K = s2/(s2+r2), mu += K(x-mu), s2 = (1-K)s2; range = mu +/- 1.96 sigma clipped to [0,100].
build_profile(user_id) replays all observations in time order and returns a Profile exactly as in
docs/contracts.md (trend = mu now minus mu 7 days ago). Every time new observations arrive, save a Snapshot.
pipeline.py: on_new_events(user_id, events) -> extract observations, update beliefs, save a Snapshot.
Routers: GET /api/profile/{user_id}, GET /api/profile/{user_id}/history.
Tests: with no data every dimension is 50 with range 1-99; 10 identical mini-game observations of 80 move the
mean above 75 and shrink the range below +/-10; the fixture batch produces a profile with n_obs > 0 for memory.
Also write docs/scoring.md explaining the model in plain English with the formulas.
```
**Done when:** posting the fixtures returns a sensible profile; the range shrinks as you post more.

---

## Task 2.3: Twin history, projection, heatmap, goals (Oct 26–27)

**Projection ("what-if"):** fit the user's own gain per session from their snapshots (slope of μ against session count, last 10 sessions, capped at +2 points per session and at 0 below). Projected μ after `s` more sessions = μ + gain × s. Range: current σ widened by `+3 per week`. Always return the disclaimer "Estimate based on your own past progress. Not a prediction of ability."

**Prompt:**
```
In backend/app/scoring/projection.py implement project(user_id, sessions_per_week, weeks) returning a Projection
as in docs/contracts.md: per dimension, gain per session = slope of snapshot means over the last 10 sessions,
clamped to [0, 2]; for week w: score = mu + gain*sessions_per_week*w, half-width = 1.96*sigma + 3*w, clipped to
0-100; with fewer than 3 sessions return gain 0 and the wide range. Add GET /api/profile/{user_id}/projection.
heatmap.py: average observation value per dimension per time slot (08-12, 12-16, 16-20, 20-24, 00-08) using the
user's local hour from the event ts; null when no data. GET /api/heatmap/{user_id}.
goals: GET/POST /api/goals/{user_id}; progress = (current mu - mu at creation) / (target - mu at creation), 0-1.
Tests for each.
```

---

## Task 2.4: Adaptive plan and frustration (Oct 26–27) ← layer C

**Rules:**
- **Mini-game levels:** the frontend's staircase already adapts inside a game; you store `level_end` and start the next game there.
- **Opponent level** (1–5): +1 after 2 wins in a row, −1 after 2 losses in a row, start at 2.
- **Focus dimension:** the one with the highest `need = (100 − μ) + 0.5 × (high − low)`, so both weak and uncertain skills get trained.
- **Plan:** 2 mini-games for the focus dimension, 1 for the most uncertain other dimension, 1 Rami round (quick mode if the user's last 3 sessions were short).
- **Frustration flag** `suggest_break = true` when, in the last round, there are 3 turns in a row with `think_ms < 1500` and `quality < 0.4`, or the round was abandoned, or 3 losses in a row today. M3 shows a gentle message; the next plan lowers the opponent level by 1.

**Prompt:**
```
In backend/app/scoring/adaptive.py implement next_plan(user_id) returning a Plan exactly as in docs/contracts.md
with these rules: [paste the rules above]. The reason field explains the choice in one plain sentence using the
numbers (e.g. "Reasoning has the lowest score (61) and its range is still wide."). frustration.py implements
the suggest_break rule and sets Profile.flags.suggest_break. GET /api/plan/{user_id}. Tests for each rule.
```

---

## Task 2.5: AI Collaboration Score (Oct 27–28) ← innovation points

Computed from the `coach` events over the user's last 10 sessions. A component with no data is `null` and the others are re-weighted, so a user who never asked for a hint isn't punished.

| Component (weight) | Formula (0–100) |
|---|---|
| Clarification (20%) | % of shown hints where the user pressed "Why?" or sent a chat question before acting |
| Verification (25%) | **Calibrated trust:** % of hints where the user's decision was right: followed a good hint, or did not follow a bad one (`hint_followed` + `hint_outcome`). +10 bonus (cap 100) if the user used "Check" on low-confidence hints (< 0.6) |
| Iteration (20%) | (`position_retried` + `review_opened`) / (rounds lost + rounds with a review available), capped at 100 |
| Autonomy (20%) | 100 × (1 − hints requested / user turns) |
| Responsible use (15%) | starts at 100; −10 per hint requested in the first 2 s of a turn (didn't try first), −10 per 3+ hints within 3 turns (spamming), −20 per chat message flagged `contains_personal_data` |

`total = Σ weight × score / Σ weights of non-null components`. Write the formula and the reasoning in `docs/scoring.md`: the judges asked for a documented formula.

**Prompt:**
```
In backend/app/scoring/collab.py implement collab_score(user_id) returning CollabScore exactly as in
docs/contracts.md using the coach events of the last 10 sessions and these formulas: [paste the table above].
Each component also returns n (number of events it is based on). Null components are excluded and the remaining
weights re-normalised. GET /api/collab/{user_id}. Tests with hand-made event lists: a user who follows every
bad hint gets verification near 0; a user who never asks for hints gets autonomy 100 and clarification null.
```

---

## Task 2.6: Evidence sheet for the coach (Oct 24–25) ← M3 depends on this

The coach may only say things that are in this sheet, so make the `text` of each fact concrete and human (turn numbers, cards, numbers).

**Prompt:**
```
In backend/app/evidence.py implement build_evidence(user_id, round_id) returning an EvidenceSheet exactly as
shared/fixtures/evidence.json (same keys, same style of fact text). Facts to detect from the round's events, each
with a sequential id F1, F2...: fed_opponent (turn events), missed_lay_off / missed_joker_swap / missed_meld
(missed.*), low_quality_discard (turn_graded quality < 0.5, with turns_to_out played vs best), fast_and_wrong
(3+ consecutive turns with think_ms < 1500 and quality < 0.5), good_opening (round's first lay_down, with its point
value and turn), plan_switch, recall_probe_wrong, hint_rejected_bad and hint_followed_bad (hint_followed +
hint_outcome), best_turn (highest quality). stats: turns, avg_quality, median_think_ms, missed_lay_offs, hints_used,
user_penalty, ai_penalty. profile_delta = mu change per dimension caused by this round. Card ids like "8H.1" must
be written as "8H" in text. GET /api/evidence/{user_id}/{round_id}. Test with shared/fixtures/events-round.json.
```

---

## Task 2.7: Ethics, retention and demo data (Oct 28–29)

**Prompt:**
```
1) Retention: on startup and once a day, delete events older than RETENTION_DAYS (env, default 90) and users
inactive for 180 days. 2) Store only a nickname, never email, name, camera or audio. 3) Write docs/data-and-ethics.md:
what we collect (table of event types), why, where it is stored, retention, export, deletion, consent versioning,
no clinical use, no decisions from face or voice (we don't use them at all), the LLM sees only the evidence sheet,
never the user's nickname. 4) backend/scripts/seed_demo.py: create 2 demo users ("demo-improver", "demo-new")
by simulating 3 weeks of sessions with plausible events (improver gains slowly in reasoning and memory), posting
them through the real pipeline so history, projection, heatmap and collab are realistic. Mark these users with
is_demo=true and show "Simulated demo data" in their nickname.
```

---

## Your deadlines
| Date | Deliverable |
|---|---|
| Oct 20 | Repo created and shared |
| Oct 22 | Events stored, export and delete work |
| Oct 24 | Profile with ± from the fixtures, evidence sheet |
| Oct 25 | **Integration 1**: real events from M1's table produce a profile; M3's coach reads your evidence |
| Oct 28 | Plan, collab score, projection, heatmap, goals, retention |
| Oct 29 | **Feature freeze**, demo data seeded on the deployed server |
| Oct 30 | Report sections (≈2.5 pages): "Assessment and uncertainty model", "Brain Twin and adaptation", "AI Collaboration Score", "Data and ethics" |

# Contributing

Four people build this in parallel and merge often. These rules let us do that without meetings.

## 1. The contract comes first
[`docs/contracts.md`](docs/contracts.md) defines every endpoint, event payload and response shape. [`shared/types.ts`](shared/types.ts) is the same contract in TypeScript and [`shared/fixtures/`](shared/fixtures/) holds samples in the exact format.

- Code against the contract, and use the fixtures until the real counterpart exists.
- To change `docs/contracts.md` or anything in `shared/`: open a **Contract change** issue (or post in the chat), get one teammate's "ok", then edit and add a line to the changelog at the bottom of the contract.

## 2. Write only in the folders you own
| Member | Folders |
|---|---|
| M1, game | `frontend/src/engine/`, `frontend/src/game/`, `frontend/src/minigames/`, `docs/rami-rules.md` |
| M2, data & Brain Twin | `backend/` except `backend/app/coach/`, `docs/scoring.md`, `docs/data-and-ethics.md` |
| M3, coach & dashboard | `frontend/src/app/`, `frontend/src/api/`, `frontend/src/coach/`, `frontend/src/dashboard/`, `frontend/src/onboarding/`, `backend/app/coach/`, `README.md` |

## 3. Branches and pull requests
- One branch per member: `m1-game`, `m2-twin`, `m3-coach` (short-lived `m2-twin/<topic>` branches are fine too).
- `main` is protected: everything lands through a pull request, and CI must be green.
- Open a PR into `main` **at least every 2 days**. Anyone can merge a PR that touches only its author's folders.
- Keep PRs small and fill in the PR template checklist.

## 4. Commits
Use [Conventional Commits](https://www.conventionalcommits.org/) with the area as scope:

```
feat(backend): store events with duplicate-safe insert
fix(engine): reject K-A-2 runs
test(twin): range shrinks after 10 observations
docs(scoring): explain the Kalman update
chore: add CI workflow
```

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `perf`.

## 5. Tests
Each owner tests their own code before opening a PR.

| Part | Command |
|---|---|
| Backend | `cd backend && python -m pytest` (tests load `shared/fixtures/events-round.json`) |
| Frontend | `cd frontend && npx vitest run` |

## 6. Rules that protect the score
- **Non-clinical everywhere.** Never diagnose. The blocked-word list is in [`docs/team/member-3-coach.md`](docs/team/member-3-coach.md).
- Every score is shown with its range (`score`, `low`, `high`, `n_obs`). Projections always carry their disclaimer.
- The coach states only facts from the evidence sheet and cites their ids.
- We store a nickname only. No camera, microphone, real names or contact details.
- Never commit secrets: keys go in `backend/.env` (ignored by git). Commit a `.env.example` instead.

## 7. Daily update
One line in the team chat every evening: **done today · blocked on · next.**

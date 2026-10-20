# Starter kit: how the team works

The original kit the repo was created from. Each member reads `docs/contracts.md` first, then their own task pack.

| File | Who reads it |
|---|---|
| [`contracts.md`](contracts.md) | **Everyone, first.** Folder ownership, event formats, API, data shapes, our Rami rules |
| [`../shared/types.ts`](../shared/types.ts) | The same contract as TypeScript types |
| [`../shared/fixtures/`](../shared/fixtures/) | Sample data in the exact contract format, so nobody waits for anybody |
| [`team/member-1-game.md`](team/member-1-game.md) | Member 1: Rami engine, AI opponent, turn grader, game table, mini-games |
| [`team/member-2-twin.md`](team/member-2-twin.md) | Member 2: backend, scoring with uncertainty, Brain Twin, adaptive plan, collab score, ethics |
| [`team/member-3-coach.md`](team/member-3-coach.md) | Member 3: app shell, AI coach, hint panel, dashboard, onboarding, report, slides, video |

## Working alone without meetings
- Only write in the folders you own. The contract says which.
- Work on your own branch (`m1-game`, `m2-twin`, `m3-coach`) and open a pull request into `main` at least every 2 days. Anyone can merge a PR that touches only its owner's folders.
- A change to `docs/contracts.md` or `shared/` needs one "ok" from a teammate in the chat, plus a changelog line.
- Post one line in the team chat each evening: done today, blocked on, next.

## Integration days
**Oct 25, Integration 1** (everyone, 1–2 hours on a call):
1. Pull `main`, run the backend (`uvicorn app.main:app`) and the frontend (`npm run dev` with `VITE_USE_MOCK=false`).
2. Play one quick round. Check in the backend that the events arrived (`GET /api/data/{id}/export`).
3. Open the profile: dimensions should have `n_obs > 0`.
4. Open the review for that round: it must cite real facts.
5. Write down every mismatch with the contract and who fixes it.

**Oct 29, Feature freeze:** the full flow (welcome → consent → plan → mini-game → round → review → dashboard → delete data) works on the deployed version. After this, bug fixes only.

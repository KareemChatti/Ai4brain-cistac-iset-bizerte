# How to add a mini-game

Each mini-game is a plug-in. A new skill (for example a surprise dimension at the pitch) needs one component and one registry entry. The host takes care of the instructions, the 3-2-1 countdown, the clock, the difficulty staircase and the events.

## 1. Write the game component
Create `frontend/src/minigames/games/MyGame.tsx`. It receives `MiniGameProps` (`frontend/src/minigames/types.ts`):

| Prop | Use |
|---|---|
| `level` | Current difficulty. Read it when you build the next trial |
| `record({ correct, rtMs, extra })` | Call once per answer. The host logs a `trial` event and moves the level (2 correct in a row: up; 1 wrong: down) |
| `timeUp` | Becomes true when the time budget is spent. Finish the trial on screen and start no new one |
| `finish()` | End right away (for games with no pending trial, such as quick answers) |
| `rng()` | Seeded random numbers |

Put anything the scoring needs into `extra`, for example `{ span: 5 }` or `{ hits: 2, targets: 3 }`. Reuse `CardView` from `src/game/Card.tsx` for cards, and put trial generation in `generators.ts` as pure functions so it can be tested.

## 2. Register it
Add an entry to `MINIGAMES` in `frontend/src/minigames/registry.ts`:

```ts
my_game: {
  id: "my_game",
  dimension: "attention",          // one of the five dimensions
  title: "My game",
  instructions: ["What to do, in one line each."],
  minLevel: 1,
  maxLevel: 8,
  durationMs: 60_000,
  scoreRaw: (trials) => trials.filter((t) => t.correct).length,
  Component: MyGame,
},
```

The game is now playable at `/train/my_game`. `MiniGameHost` logs `minigame_end` with `level_start`, `level_end`, `n_trials`, `accuracy` and `score_raw`.

## 3. Score it in the backend
In `backend/app/scoring/observations.py`, add the game to `MINIGAME_DIMENSION` and a scorer to `MINIGAME_SCORERS` that maps the game to a 0–100 value. Until you do, any new game is scored as **accuracy × 100** for the dimension it declares, so it already feeds the Brain Twin. Document the formula in `docs/scoring.md`.

A brand-new dimension (not one of the five) also needs adding to `DIMENSIONS` in `backend/app/schemas.py` and `shared/types.ts`. That changes the contract, so agree on it with a teammate first (see `CONTRIBUTING.md`).

## 4. Test it
Add generator tests to `frontend/src/minigames/__tests__/minigames.test.ts` (the right answer is always right, levels change difficulty) and run:

```bash
cd frontend && npx vitest run src/minigames
```

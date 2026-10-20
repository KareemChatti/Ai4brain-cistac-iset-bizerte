# Member 1: Game & play

**You build:** the Rami game engine, the AI opponent, the turn grader, the hint engine, the game table screen, the event logger and the 5 mini-games.
**You own:** `frontend/src/engine/`, `frontend/src/game/`, `frontend/src/minigames/`, `docs/rami-rules.md`.
**You never edit:** anything else. If you need something from M2 or M3, it is already described in `docs/contracts.md`.

## Technologies
- TypeScript (strict), React 18, Vite, Tailwind CSS
- Zustand for the game state store
- Vitest for unit tests (the engine must be well tested, it is the base of everything)
- Web Worker (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`) for the slow evaluator
- Cards drawn as SVG/HTML in code, no image assets needed
- Optional: Framer Motion for card animations, only after everything works

## How to use the prompts
Each task below has a prompt. Paste it into your AI coding assistant (Claude Code, Cursor, Copilot chat...) **from the repo root**, so it can read `docs/contracts.md` and `shared/types.ts`. Do the tasks in order; each one ends with a "done when" check. Commit after each task.

---

## Task 1.1: Rules document and engine core (Oct 19–21)

**Goal:** a pure TypeScript Rami engine with no UI that can play a full round between two scripted players.

**How:**
- Write `docs/rami-rules.md` from section 7 of the contracts (copy it and add examples).
- Model: `Card {id, rank, suit, deck}`, `Meld {cards, kind: 'set'|'run'}`, `GameState {stock, discard, hands[2], table: Meld[], opened[2], turn, phase}`.
- Use a seeded random generator (e.g. mulberry32) so a seed replays the same deal. This matters for the review screen and for puzzles.
- The hardest function is `findMelds(hand)`: the best way to split a hand into melds with jokers. Use backtracking: sort cards, try every set and run that contains the first unused card, recurse, keep the partition that leaves the lowest deadwood value. 15 cards is small enough.

**Prompt:**
```
Read docs/contracts.md (section 3 and 7) and shared/types.ts. In frontend/src/engine/ create a pure TypeScript
Rami engine (no React, no DOM) for 2 players with these exact rules: two 52-card decks + 4 jokers, deal 14
(first player 15 and starts by discarding), draw from stock or top discard (discard pick only allowed if the
card is laid down this turn), sets = 3-4 same rank all different suits, runs = 3+ consecutive same suit with
ace low (A-2-3) or high (Q-K-A) and no wrap, max one joker per meld, first lay-down must total >= 71 points
(2-10 face value, J/Q/K = 10, ace = 11 or 1 in A-2-3, joker = value of the card it replaces), after opening
players may lay off on any table meld and swap a table joker by placing the real card (the joker must be used
the same turn), going out = no cards left, penalty = points left in hand with joker = 25 and 100 if never opened.
Also support a quickMode config: one deck + 2 jokers, deal 10, opening minimum 40.
Files: cards.ts (card ids like "7H.1", "JK.2", seeded shuffle with mulberry32), melds.ts (isValidSet, isValidRun,
meldValue, findMelds(hand) using backtracking that returns the partition with the lowest deadwood, canLayOff),
state.ts (GameState type, newGame(seed, config)), rules.ts (legalActions(state, player), applyAction(state, action)
returning a NEW state, isRoundOver, scoreRound). Actions: drawStock, drawDiscard, layDown(melds), layOff(card, meldIndex),
swapJoker(card, meldIndex), discard(card).
Write Vitest tests in frontend/src/engine/__tests__/ covering: valid/invalid sets and runs with and without jokers,
Q-K-A valid and K-A-2 invalid, the 71-point opening, discard pick rule, joker swap, penalty scoring, and a full
round between two random legal players for 200 seeds that always terminates with no illegal state.
```
**Done when:** `npx vitest run` is green and 200 random rounds all finish.

---

## Task 1.2: AI opponent, 5 levels (Oct 21–23)

**How:** All levels share one function `distanceToOut(hand, table, opened)`: the number of cards not in melds after `findMelds`, plus a penalty if the 71 opening isn't reachable yet. Lower is better.
- L1: random legal discard.
- L2: greedy, keep cards that are in melds or one card from a meld, discard the highest-value isolated card.
- L3: L2 + memory, never discard a card that fits what the opponent picked from the discard pile.
- L4: L3 + one-step lookahead, for each possible discard average `distanceToOut` over every unseen card it could draw next.
- L5: Monte Carlo, sample the hidden cards 100 times and play out with L3 policy, pick the discard with the fewest expected turns to go out.

**Prompt:**
```
In frontend/src/engine/ai.ts implement chooseAction(state, player, level: 1|2|3|4|5, rng) for the Rami engine
in this folder. Add distanceToOut(hand, table, opened) in eval.ts = cards not covered by findMelds, plus 3 if the
player has not opened and cannot reach 71 points yet. Levels: 1 random legal discard; 2 greedy (draw the discard
only if it completes a meld, lay down as soon as legal, discard the highest-value card not in a meld or near-meld);
3 = level 2 plus tracking of cards the opponent picked from the discard pile, never discard a card that would extend
a meld those cards could form; 4 = level 3 plus one-step lookahead averaging distanceToOut over all unseen cards;
5 = Monte Carlo: sample the unknown cards (stock + opponent hand) 100 times consistent with what is visible,
play each sample to the end with the level-3 policy, choose the discard with the lowest mean turns to go out.
The AI only sees what a real player sees (its hand, the table, the discard pile, the history). Add tests:
level 5 beats level 1 in at least 70% of 100 seeded quick-mode rounds; each level decides in under 300 ms
for levels 1-4 (measure in the test).
```
**Done when:** the win-rate test passes and level 5 runs in under 2 s per decision.

---

## Task 1.3: Turn grader and hint engine (Oct 23–24, finish Oct 27)

This is what makes the project special: we grade **decisions, not luck**.

**How:**
- `gradeTurn(stateBeforeDiscard, playedDiscard)`: for every possible discard, estimate expected turns to go out with the L5 Monte Carlo (200 samples). Return `quality = 1 - (T_played - T_best) / max(1, T_worst - T_best)`, plus `best_discard`, `turns_to_out_played`, `turns_to_out_best`.
- Run it in a Web Worker **after the round** for every user turn, then send `turn_graded` events. During play, `turn` events go out with `quality: null`.
- `getHint(state)`: deliberately uses the faster L4 logic, so it is sometimes wrong. `confidence` = share of 30 quick samples where the hinted card was the best choice. `reason_codes` explain the choice (e.g. `keeps_run_open`, `isolated_high_card`, `opponent_collects_hearts`, `needed_for_opening`).
- After the round, the grader also decides whether each hint was good (hinted card within 0.3 turns of the best), and you send `hint_outcome`.

**Prompt:**
```
In frontend/src/engine/ add grader.ts and hints.ts.
gradeTurn(state, player, playedDiscard, samples=200) evaluates every legal discard with the Monte Carlo from ai.ts
level 5 and returns {quality, best_discard, turns_to_out_played, turns_to_out_best} where
quality = 1 - (T_played - T_best) / max(1, T_worst - T_best), rounded to 2 decimals.
getHint(state, player): pick the action with the level-4 logic, compute confidence = fraction of 30 random samples
in which that card is also the best discard, and return a Hint object exactly as in shared/types.ts with reason_codes
chosen from: keeps_run_open, keeps_set_open, isolated_high_card, needed_for_opening, opponent_collects_<suit>,
discard_completes_meld, safe_discard. hintWasGood(hintCard, grade) = hinted card's expected turns within 0.3 of best.
Create frontend/src/engine/worker.ts, a Web Worker that receives {roundLog} after a round, grades every user turn
and posts back the results one by one. Add tests on hand-made positions where the best discard is obvious.
```
**Done when:** on 3 hand-made positions the obvious discard gets quality ≥ 0.9 and a terrible one ≤ 0.3.

---

## Task 1.4: Game table screen + event logger (Oct 21–24)

**How:** Build `<RamiTable>` exactly with the props in contracts section 2. M3 mounts it, you don't build routes or menus. Layout: opponent hand (face down) on top, table melds in the middle, stock and discard pile on the side, your hand at the bottom with drag or click to select, buttons Draw, Lay down, Discard, Hint. A small "recall probe" pops up about once every 6 turns ("Which card did your opponent take last turn?") with 4 card choices.

The logger (`frontend/src/game/logger.ts`) is used by the table **and** the mini-games: `logEvent(source, type, payload)` builds the full Event (uuid, ts, ids), buffers, and POSTs to `/api/events` every 10 events, at round end and on `pagehide`. If `VITE_USE_MOCK=true`, it just `console.log`s.

**Prompt:**
```
In frontend/src/game/ build a React + TypeScript + Tailwind component RamiTable with exactly these props from
docs/contracts.md section 2: userId, sessionId, opponentLevel, quickMode, hintsEnabled, onRoundEnd(summary),
renderHintPanel(hint, actions). Use a Zustand store wrapping the engine in frontend/src/engine (never put rules
in the component). Layout: opponent's face-down hand on top, table melds in the centre, stock and discard pile
on the right, the user's hand at the bottom (click to select cards, button to auto-sort by suit/rank), buttons
Draw stock, Take discard, Lay down, Lay off, Discard, Hint. Cards are drawn with HTML/CSS (rank + suit symbol,
red for H/D). The AI opponent plays with chooseAction after a 700 ms delay.
Create frontend/src/game/logger.ts: logEvent(source, type, payload, roundId?) builds an Event exactly as in
shared/types.ts (uuid v4, ISO ts), buffers, and POSTs {events} to `${import.meta.env.VITE_API_URL}/api/events`
every 10 events, at round end, and on pagehide using navigator.sendBeacon. If VITE_USE_MOCK is "true", log to the console.
Log these events with the exact payloads in docs/contracts.md section 4: round_start, turn (measure think_ms from
the start of the turn, options_count = number of legal actions, missed.* computed by the engine at the moment of
discard, fed_opponent when the opponent picks up your discard next turn), recall_probe (show one every ~6 turns
with 4 card choices), plan_switch (when the user breaks up a partial run to build a set or the opposite), round_end,
hint_requested, hint_shown, hint_followed. After round_end, start the grader worker and send turn_graded and
hint_outcome events as results arrive. Add a dev page frontend/src/game/DevTable.tsx that renders RamiTable with
a fake hint panel so it works without M3's code.
```
**Done when:** you can play a full quick round against level 2 in the browser and see correct events in the console.

---

## Task 1.5: Five mini-games + registry (Oct 25–28)

Each mini-game is a **plug-in**, so a surprise dimension on Nov 6 is one new file. Every game: about 60 seconds, a 2-up/1-down staircase on `level` (two correct in a row → level +1, one wrong → level −1, which keeps success near 71%), logs a `trial` event per answer and a `minigame_end` at the end.

| id | Dimension | Gameplay | Level controls |
|---|---|---|---|
| `card_recall` | memory | Cards flash one by one (1 s each), then the player rebuilds the order from a palette | sequence length 3→9 |
| `meld_spotter` | attention | A scrambled 12-card hand; tap all cards of the one valid meld before the timer | time 10 s→4 s, number of near-miss decoys |
| `quick_match` | speed | A meld and one card appear; press "fits" or "doesn't fit" as fast as possible | 45 s fixed, harder near-misses with level |
| `rami_puzzle` | reasoning | A hand and table: pick the discard that gets you out fastest (answer from `gradeTurn`) | hand size, jokers, number of good-looking traps |
| `rule_switch` | flexibility | Sort cards into "fits / doesn't fit"; the hidden rule (same rank, same suit run, same colour) changes after 6 correct in a row | number of rules, switch frequency |

**Prompt:**
```
In frontend/src/minigames/ create a plug-in system: registry.ts exports MINIGAMES: Record<MiniGameId,
{id, dimension, title, instructions, minLevel, maxLevel, Component}>, and MiniGameHost.tsx with props
{gameId, level, userId, sessionId, onDone(result: MiniGameResult)} that shows the instructions, a 3-2-1 countdown,
runs the game for ~60 s and calls onDone. Shared hook useStaircase(startLevel, min, max) implementing 2-up/1-down.
Every answer logs a "trial" event and the end logs "minigame_end" via frontend/src/game/logger.ts with the exact
payloads in docs/contracts.md section 4. Implement the 5 games in separate files: card_recall, meld_spotter,
quick_match, rami_puzzle (positions generated with the engine; the correct answer is the best_discard from
gradeTurn; precompute 50 positions per level into a JSON at build time if live grading is too slow), rule_switch
(Wisconsin-card-sorting style: rule changes silently after 6 consecutive correct; record trials_to_adapt and
perseverative_errors in extra). Reuse the card component from frontend/src/game. Add a dev page listing all 5 games.
Then write docs/how-to-add-a-minigame.md explaining the 4 steps to add a new game for a new dimension.
```
**Done when:** all 5 games run from the dev page and emit correct events; adding a dummy 6th game takes under an hour.

---

## Task 1.6: Puzzles from the player's own mistakes (Oct 28, if time)
```
Add frontend/src/minigames/rami_puzzle/fromMistakes.ts: given graded turns from the last rounds (quality < 0.5),
rebuild the position from the round seed and turn number and turn it into a puzzle for rami_puzzle.
```

## Your deadlines
| Date | Deliverable |
|---|---|
| Oct 21 | Engine + tests merged, `docs/rami-rules.md` |
| Oct 24 | Playable round vs AI levels 1–3 with events logged |
| Oct 25 | **Integration 1**: RamiTable mounted in M3's shell, events reaching M2's server |
| Oct 28 | 5 mini-games, grader in worker, levels 4–5 |
| Oct 29 | **Feature freeze** |
| Oct 30 | Report section "Game engine and mini-games" (≈1 page): rules, the 5 games and the standard task each is based on, the turn grader formula. Record the 20-second rules intro for the video. |

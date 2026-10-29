# Shared contracts (read this first, all 3 members)

This file is the **only** thing the three of you must agree on. If everyone codes against it, the three parts plug together at the end without meetings.

**Rules for working alone**
1. Each member writes only inside the folders they own (see "Folder ownership").
2. Nobody changes this file alone. If you need a change, post it in the team chat, wait for one "ok", then edit it and add a line to the changelog at the bottom.
3. Until the real backend exists, everyone works against the sample files in `shared/fixtures/`. They follow this contract exactly.
4. Merge into `main` at least every 2 days through a pull request. Integration days: **Oct 25** and **Oct 29**.

---

## 1. Tech stack (fixed)

| Part | Tech |
|---|---|
| Frontend | Vite + React 18 + TypeScript, Tailwind CSS, Zustand (state), React Router, Recharts (charts), Vitest (tests) |
| Game engine | Pure TypeScript in `frontend/src/engine/`, no React inside, heavy work in a Web Worker |
| Backend | Python 3.11, FastAPI, SQLModel + SQLite, Pydantic v2, numpy, pytest, uvicorn |
| Coach LLM | Anthropic Python SDK, model `claude-sonnet-5-5` (key in `backend/.env` as `ANTHROPIC_API_KEY`); provider hidden behind one function so it can be swapped |
| Voice (bonus) | Browser Web Speech API (`speechSynthesis`), no extra service |
| Hosting for demo | Frontend on Vercel or Netlify, backend on Render or Railway, or everything local for the video |

## 2. Repository layout and folder ownership

```
ai4brain-rami/
├── README.md                         M3 (final), everyone adds their part
├── docs/
│   ├── contracts.md                  shared (this file)
│   ├── rami-rules.md                 M1
│   ├── scoring.md                    M2  (formulas for the report)
│   └── team/                         task packs
├── shared/
│   ├── types.ts                      shared TypeScript types (this contract in code)
│   └── fixtures/*.json               sample data that follows this contract
├── frontend/
│   ├── src/engine/                   M1  rules, AI opponent, evaluator, hints
│   ├── src/game/                     M1  <RamiTable/> and the event logger
│   ├── src/minigames/                M1  5 mini-games + registry
│   ├── src/app/                      M3  app shell, routes, layout
│   ├── src/api/                      M3  API client + mock mode
│   ├── src/coach/                    M3  review screen, hint panel, chat
│   ├── src/dashboard/                M3  charts and goals
│   └── src/onboarding/               M3  consent, data page
└── backend/
    ├── app/main.py                   M2
    ├── app/models.py, db.py          M2
    ├── app/routers/                  M2  users, events, profile, plan, collab, data
    ├── app/scoring/                  M2  uncertainty, twin, adaptive, collab, frustration
    ├── app/evidence.py               M2  builds the evidence sheet for the coach
    ├── app/coach/                    M3  LLM calls, prompts, guardrails, fallback
    └── tests/                        each owner tests their own code
```

**How the frontend pieces plug together.** M3 owns the app shell and routes. M1 delivers two React components that M3 mounts:

```tsx
<RamiTable userId={id} sessionId={sid} opponentLevel={3} quickMode={false}
           hintsEnabled onRoundEnd={(summary: RoundSummary) => ...}
           renderHintPanel={(hint: Hint, actions: HintActions) => <HintPanel .../>} />

<MiniGameHost gameId="card_recall" level={4} userId={id} sessionId={sid}
              onDone={(result: MiniGameResult) => ...} />
```

`renderHintPanel` lets M3 draw the hint panel inside M1's table without touching M1's code.

## 3. Shared vocabulary

- **Dimensions:** `memory`, `attention`, `speed`, `reasoning`, `flexibility`
- **Mini-game ids:** `card_recall` (memory), `meld_spotter` (attention), `quick_match` (speed), `rami_puzzle` (reasoning), `rule_switch` (flexibility)
- **Cards:** rank + suit, ranks `A 2 3 4 5 6 7 8 9 T J Q K`, suits `S H D C`, joker `JK`. Two decks, so a card id adds the deck: `"7H.1"`, `"7H.2"`, `"JK.1"`. In events, send the id.
- **Ids:** `user_id`, `session_id`, `round_id` are UUID v4 strings made by the frontend. Times are ISO 8601 UTC strings. Durations are in milliseconds.

## 4. Events (frontend → backend)

Everything the user does is an event. The frontend buffers them and sends batches.

`POST /api/events` with body `{ "events": Event[] }` → `{ "accepted": number }`

```ts
type Event = {
  event_id: string; user_id: string; session_id: string;
  round_id: string | null;           // null outside a Rami round
  ts: string;                        // ISO time
  source: "rami" | "minigame" | "coach" | "app";
  type: string;                      // see table
  payload: Record<string, unknown>;
}
```

| source | type | payload | sent by |
|---|---|---|---|
| rami | `round_start` | `{opponent_level, seed, quick_mode, hints_enabled, live_coach, rules, match_id}` (`match_id` null for single rounds) | M1 |
| rami | `match_start` | `{match_id, target, rules: {decks, jokers, hand_size, opening_min, opponent_level}}` (`round_id` null) | M1 |
| rami | `match_end` | `{match_id, winner: "user"|"ai", user_total, ai_total, rounds, target}` (`round_id` null) | M1 |
| rami | `turn` | `{turn_no, draw_source: "stock"\|"discard", drawn, discarded, laid_down: string[][], laid_off: number, joker_swaps: number, think_ms, options_count, missed: {lay_offs, joker_swaps, melds_in_hand}, fed_opponent: boolean, quality: number\|null, best_discard: string\|null, turns_to_out_played: number\|null, turns_to_out_best: number\|null}` | M1 |
| rami | `recall_probe` | `{turn_no, question, correct: boolean, rt_ms}` | M1 |
| rami | `plan_switch` | `{turn_no, from: "run"\|"set", to: "run"\|"set", turns_waited}` | M1 |
| rami | `round_end` | `{winner: "user"\|"ai", user_penalty, ai_penalty, turns, duration_ms, abandoned: boolean, opened: boolean}` | M1 |
| rami | `turn_graded` | same keys as `turn` quality fields, sent after the round when the slow evaluator finishes | M1 |
| minigame | `trial` | `{game, dimension, level, correct: boolean, rt_ms, extra: object}` | M1 |
| minigame | `minigame_end` | `{game, dimension, level_start, level_end, n_trials, accuracy, score_raw}` | M1 |
| coach | `hint_requested` | `{hint_id, turn_no, ms_into_turn}` | M1 (table) |
| coach | `hint_shown` | `{hint_id, action, card, confidence}` | M1 (table) |
| coach | `hint_why` | `{hint_id}` | M3 (hint panel) |
| coach | `hint_checked` | `{hint_id}` (user opened the card tracker to verify) | M3 |
| coach | `hint_followed` | `{hint_id, followed: boolean}` | M1 (table knows what was played) |
| coach | `hint_outcome` | `{hint_id, was_good: boolean}` (after the round, from the evaluator) | M1 |
| coach | `position_retried` | `{round_id, turn_no}` | M3 (review screen) |
| coach | `review_opened` | `{round_id}` | M3 |
| coach | `chat_message` | `{length, contains_personal_data: boolean}` (never the text) | M3 |
| app | `consent_given` | `{consent_version, analytics: boolean}` | M3 |
| app | `goal_set` | `{dimension, target}` | M3 |
| coach | `coach_alert` | `{kind: "missed_lay_off"|"joker_swap"|"opening_reachable"|"feeds_opponent", turn_no, cards: string[], followed: boolean}` one per kind and turn, sent when the turn ends | M1 (table) |

## 5. Backend API (M2 builds, M1 and M3 call)

Base URL from env `VITE_API_URL` (frontend). All JSON.

| Method + path | Body / query | Returns | Owner |
|---|---|---|---|
| `POST /api/users` | `{nickname}` | `{user_id}` | M2 |
| `POST /api/consent` | `{user_id, consent_version, analytics}` | `{ok}` | M2 |
| `POST /api/events` | `{events}` | `{accepted}` | M2 |
| `GET /api/profile/{user_id}` | | `Profile` | M2 |
| `GET /api/profile/{user_id}/history` | | `Snapshot[]` | M2 |
| `GET /api/profile/{user_id}/projection` | `?sessions_per_week=3&weeks=4` | `Projection` | M2 |
| `GET /api/plan/{user_id}` | | `Plan` | M2 |
| `GET /api/collab/{user_id}` | | `CollabScore` | M2 |
| `GET /api/heatmap/{user_id}` | | `Heatmap` | M2 |
| `GET/POST /api/goals/{user_id}` | `{dimension, target}` | `Goal[]` | M2 |
| `GET /api/evidence/{user_id}/{round_id}` | | `EvidenceSheet` | M2 |
| `POST /api/coach/review` | `{user_id, round_id}` | `Review` | M3 |
| `POST /api/coach/explain-hint` | `{user_id, hint: Hint, state_summary}` | `{text}` | M3 |
| `POST /api/coach/chat` | `{user_id, message}` | `{reply, fact_ids}` | M3 |
| `GET /api/matches/{user_id}` | `?limit=20` | `MatchSummary[]`, newest first | M2 |
| `WS /ws/session/{user_id}` | live session, see §5b | messages | M2 |
| `GET /api/data/{user_id}/export` | | full JSON dump | M2 |
| `DELETE /api/data/{user_id}` | | `{deleted: true}` | M2 |

## 5b. Live session (WebSocket)

While the app is open, the table keeps one WebSocket to `/ws/session/{user_id}` (`ws://` locally, `wss://` when deployed; `VITE_WS_URL` overrides the address). Events are streamed the moment they are logged instead of in HTTP batches; the server stores and scores them exactly like `POST /api/events`. If the socket is down, the frontend falls back to HTTP and reconnects by itself. Only the app's own origins may connect, and every event must belong to the session's user.

| Direction | Message |
|---|---|
| client → server | `{type: "events", events: Event[]}`, `{type: "ping"}` |
| server → client | `{type: "hello", user_id}` on connect |
| | `{type: "ack", event_ids: string[]}` once the events are stored (the client drops them from its retry list) |
| | `{type: "coach", kind, text, turn_no, round_id}` live coach message; `kind` is `round_start`, `pace`, `fed_opponent`, `recall`, `alerts_skipped`, `round_summary` or `match_summary` |
| | `{type: "profile", profile: Profile}` after a round is scored |
| | `{type: "pong"}`, `{type: "error", message}` (the socket stays open) |

## 6. Response shapes

All shapes are typed in `shared/types.ts` and have a sample in `shared/fixtures/`.

```ts
type DimensionKey = "memory" | "attention" | "speed" | "reasoning" | "flexibility";

type DimensionEstimate = {
  score: number;   // 0–100, posterior mean
  low: number;     // 95% range, clipped to 0–100
  high: number;
  n_obs: number;
  trend: number;   // change in score over the last 7 days
};

type Profile = {
  user_id: string; updated_at: string;
  dimensions: Record<DimensionKey, DimensionEstimate>;
  n_rounds: number; n_minigames: number;
  flags: { suggest_break: boolean };
};

type Snapshot = { ts: string; trigger: "round" | "minigame";
                  dimensions: Record<DimensionKey, DimensionEstimate> };

type Projection = { sessions_per_week: number; weeks: number;
  points: { week: number; dimension: DimensionKey; score: number; low: number; high: number }[];
  disclaimer: string };

type Plan = { focus: DimensionKey; reason: string; opponent_level: number; quick_mode: boolean;
  steps: { kind: "minigame" | "rami"; game?: string; level?: number }[] };

type CollabScore = { total: number | null;
  components: Record<"clarification"|"verification"|"iteration"|"autonomy"|"responsible_use",
                     { score: number | null; n: number }>;
  weights: { clarification: 0.20; verification: 0.25; iteration: 0.20; autonomy: 0.20; responsible_use: 0.15 } };

type Heatmap = { rows: DimensionKey[]; cols: string[];  // time slots like "08-12"
                 cells: (number | null)[][] };

type Goal = { dimension: DimensionKey; target: number; created_at: string; progress: number };

type MatchRound = { round_id: string; user_penalty: number; ai_penalty: number; winner: "user" | "ai" | null };
type MatchSummary = { match_id: string; target: number; started_at: string; ended_at: string | null;
  winner: "user" | "ai" | null; user_total: number; ai_total: number; rounds: MatchRound[] };

type Fact = { id: string;            // "F1", "F2", ...
  dimension: DimensionKey | "general"; kind: string;  // "missed_lay_off", "fed_opponent", "fast_and_wrong", ...
  turn_no: number | null; text: string; value: number | null };

type EvidenceSheet = { round_id: string; user_id: string; result: "win" | "loss" | "abandoned";
  facts: Fact[]; stats: Record<string, number>;
  profile_delta: Partial<Record<DimensionKey, number>> };

type Review = { round_id: string; headline: string;
  key_moments: { turn_no: number; title: string; explanation: string; tip: string; fact_ids: string[] }[];
  strengths: { text: string; fact_ids: string[] }[];
  next_focus: { dimension: DimensionKey; text: string; fact_ids: string[] };
  voice_text: string; source: "llm" | "template" };

type Hint = { hint_id: string; action: "draw_stock" | "draw_discard" | "discard" | "lay_down";
  card: string | null; confidence: number;  // 0–1
  reason_codes: string[] };                 // "keeps_run_open", "opponent_collects_hearts", ...

type RoundSummary = { round_id: string; winner: "user" | "ai"; turns: number; user_penalty: number };
type MiniGameResult = { game: string; level_end: number; accuracy: number; n_trials: number };
```

## 7. Our Rami rules (house rules vary, these are ours)

M1 writes the full version in `docs/rami-rules.md`. Summary everybody needs:
- 2 players. Two 52-card decks + 4 jokers. Deal 14 each; the first player gets 15 and starts by discarding.
- Turn: draw from stock or take the top discard, lay down or lay off if allowed, discard one card.
- Melds: set = 3–4 cards of the same rank, all different suits. Run = 3+ consecutive cards of one suit; ace low (A-2-3) or high (Q-K-A), no wrap. At most one joker per meld.
- First lay-down must total at least **71 points** (number cards face value, J/Q/K = 10, ace = 11 or 1 in A-2-3, joker = the card it replaces).
- Taking the top discard is only allowed if that card is laid down in the same turn.
- After opening: lay off on any meld on the table; swap a table joker by placing the real card, and the joker must be used in the same turn.
- Going out: lay down everything or discard your last card. Penalty: cards left in hand (joker = 25). Never opened = 100.
- **Quick round:** one deck + 2 jokers, deal 10, opening minimum 40.

## 8. Mock mode

Frontend: `VITE_USE_MOCK=true` makes `src/api/` return the files in `shared/fixtures/` instead of calling the server. M1 and M3 can build everything before M2's server runs.
Backend: M2's tests load `shared/fixtures/events-round.json` to check that the scoring accepts what the frontend sends.

## Changelog
- Oct 19: first version.
- Oct 29: Rami-only matches and the live session. Events `match_start`, `match_end`, `coach_alert`; `round_start` gains `live_coach`, `rules`, `match_id`. Endpoints `GET /api/matches/{user_id}` and `WS /ws/session/{user_id}` (§5b). Agreed in the Oct 28–29 plan.

# Member 3: Coach, dashboard & story

**You build:** the app shell that holds everything together, the API client with mock mode, the AI coach (game review, hint explanations, chat) with its guardrails, the hint panel, the dashboard, the onboarding and consent screens, voice coaching, and you lead the report, slides and video.
**You own:** `frontend/src/app/`, `frontend/src/api/`, `frontend/src/coach/`, `frontend/src/dashboard/`, `frontend/src/onboarding/`, `backend/app/coach/`, `README.md`.
**You never edit:** M1's engine, game and mini-game folders, or M2's backend files. You mount M1's components and call M2's API as described in `docs/contracts.md`.

## Technologies
- React 18 + TypeScript + Vite, Tailwind CSS, React Router, Zustand
- Recharts for the radar, progress curves and projection; a plain CSS grid for the heatmap
- Python FastAPI router inside M2's server for the coach (`backend/app/coach/`), Anthropic Python SDK, Pydantic for checking the LLM's JSON
- Web Speech API (`speechSynthesis`) for voice
- Slides: Google Slides or Canva; video: OBS (screen recording) + CapCut or DaVinci Resolve

## How to use the prompts
Paste each prompt into your AI coding assistant **from the repo root**, so it can read `docs/contracts.md`, `shared/types.ts` and `shared/fixtures/`. Start with mock mode: you can build everything before M1 and M2 are ready.

---

## Task 3.1: App shell, routes and API client with mock mode (Oct 20–21)

Create the Vite app first and push it on Oct 20, because M1 builds inside it.

**Prompt:**
```
Read docs/contracts.md and shared/types.ts. Create the frontend with Vite + React 18 + TypeScript + Tailwind +
React Router + Zustand in frontend/ (if it doesn't exist yet). Add a path alias "@shared" -> ../shared.
frontend/src/api/client.ts: one typed function per endpoint in docs/contracts.md section 5 using fetch and
import.meta.env.VITE_API_URL. If import.meta.env.VITE_USE_MOCK === "true", return the matching JSON from
shared/fixtures/ instead (profile.json, history.json, projection.json, plan.json, collab.json, heatmap.json,
evidence.json, review.json) after a 300 ms delay.
frontend/src/app/: App.tsx with routes /welcome (onboarding + consent), /home (today's plan from GET /api/plan
with a Start button that walks through the plan steps), /play (mounts <RamiTable/> from src/game - use a
placeholder component if that folder is still empty), /train/:gameId (mounts <MiniGameHost/> from src/minigames,
placeholder if empty), /review/:roundId, /dashboard, /coach (chat), /data (export and delete). A user id is
created once with POST /api/users and kept in localStorage. Nav bar: Home, Play, Train, Dashboard, Coach, My data.
Visual style: clean and calm, Tunisian blue (#1E5DA8) accent on white, large readable text, works on a phone.
Add .env.example with VITE_API_URL and VITE_USE_MOCK.
```
**Done when:** `npm run dev` shows every page with mock data, and M1 can drop their components in.

---

## Task 3.2: Coach review service with guardrails (Oct 21–24) ← layer B

**How it works:**
1. Your endpoint `POST /api/coach/review` calls M2's `build_evidence(user_id, round_id)` (until it exists, load `shared/fixtures/evidence.json`).
2. The LLM gets **only** the evidence sheet. It must return JSON shaped like `Review` and cite fact ids.
3. Guardrails before anything reaches the user:
   - Parse with Pydantic; if invalid, retry once.
   - Remove every key moment, strength or focus whose `fact_ids` are empty or not in the sheet.
   - Block clinical or labelling words (list below). If any appear, regenerate once, else use the template.
   - If the API fails or is slow (> 15 s), build a **template review** from the 3 most important facts. `source: "template"`. This saves the live demo.
4. Cache reviews per round so a refresh doesn't pay again.

**Blocked words** (case-insensitive, also in French and Arabic transliteration if you add those languages): diagnos, disorder, deficit, impairment, ADHD, dementia, Alzheimer, autism, dyslexia, disease, symptom, patient, treatment, therapy, clinical, cognitive decline, IQ, abnormal, low intelligence, slow learner, brain damage.

**The system prompt (start from this):**
```
You are the coach inside a Rami card game that helps people train thinking skills: memory, attention,
processing speed, reasoning and flexibility. You review one round the user just played.

Rules you must follow:
- Use ONLY the facts in the evidence sheet. Every key moment, strength and focus must list the fact ids it is
  based on. If a fact is not in the sheet, you must not say it.
- This is a game and a training tool, not a medical or psychological assessment. Never diagnose, never use
  clinical or labelling words, never comment on the person's intelligence or health.
- Talk about decisions, not about the person: "this discard fed your opponent", not "you are careless".
- Be warm, short and concrete. Mention turn numbers and cards. Each tip must be something the user can do in
  the very next round.
- Pick at most 3 key moments: the ones that cost the most, or that show a repeated pattern.
- Always include at least one real strength.
- Write voice_text as 2-4 spoken sentences, no card codes, no symbols.
- Answer with JSON only, exactly matching this schema: {schema}.

Evidence sheet:
{evidence_json}
Language: {language}
```

**Prompt:**
```
Read docs/contracts.md, shared/fixtures/evidence.json and shared/fixtures/review.json. In backend/app/coach/
(a FastAPI router that M2's app/main.py includes with one line) implement:
llm.py: complete_json(system, user, schema_model) using the official anthropic Python SDK, model from env
COACH_MODEL default "claude-sonnet-5-5", API key from ANTHROPIC_API_KEY, 15 s timeout, temperature 0.3;
keep the provider behind this one function.
prompts.py: the review system prompt [paste the prompt above], an explain-hint prompt and a chat prompt.
guardrails.py: validate the JSON against the Review Pydantic model, drop items whose fact_ids are missing or not
in the evidence, check the blocked-word list [paste the list], return (review, problems).
template.py: build a Review without the LLM from the 3 facts with the biggest impact (low_quality_discard,
fed_opponent, missed_lay_off first) and the best strength fact, source="template".
router.py: POST /api/coach/review {user_id, round_id}: get the evidence from app.evidence.build_evidence (fall back
to shared/fixtures/evidence.json if that import fails), call the LLM, run guardrails, retry once, fall back to the
template, cache by round_id in a table CoachReview. POST /api/coach/explain-hint {user_id, hint, state_summary}:
2-3 sentences explaining the hint's reason_codes and stating its confidence honestly ("I'm only 55% sure because...").
POST /api/coach/chat {user_id, message}: answers questions about the user's profile and last reviews using only
GET-profile data and the last 3 evidence sheets; if the message contains an email, phone number or full name
pattern, reply with a reminder not to share personal data and set contains_personal_data in the response.
Tests: guardrails remove an item citing "F99"; a review containing "deficit" is rejected; the template works with
the LLM disabled.
```
**Done when:** a review for the fixture round appears in under 10 s, and with the API key removed the template appears instead.

---

## Task 3.3: Review screen, hint panel, chat (Oct 24–27)

**How:**
- **Review screen** (`/review/:roundId`): headline, then the key moments as cards. Each card shows its tip and a "See the evidence" toggle listing the fact texts behind it (that's the explainability judges look for). A "Retry this position" button per moment (logs `position_retried`, opens the puzzle from M1's `fromMistakes` if it exists). A "Hint reveal" block: every hint the coach gave this round, its confidence, whether it turned out good or bad, and what the user did. A speaker button plays `voice_text`.
- **Hint panel** (passed to M1's table via `renderHintPanel`): shows the hinted move, a confidence bar with the words "I might be wrong", and buttons Follow / Ignore / Why? / Check. "Why?" calls explain-hint and logs `hint_why`. "Check" opens a card tracker (cards already played and taken by the opponent) and logs `hint_checked`.
- **Chat page:** simple chat with the coach; logs `chat_message` with only the length and the personal-data flag.

**Prompt:**
```
In frontend/src/coach/ build: ReviewPage.tsx (route /review/:roundId) calling POST /api/coach/review, showing the
headline, key moment cards each with tip, a "See the evidence" toggle that lists the matching fact texts from
GET /api/evidence, a "Retry this position" button that logs position_retried, a strengths list, the next focus,
and a "Hint reveal" section; log review_opened on mount. A speaker button reads voice_text with
window.speechSynthesis (pick an ar-TN, ar or fr voice if the user chose that language, else en).
HintPanel.tsx with props (hint: Hint, actions: HintActions) from shared/types.ts: the move in words, a confidence
bar labelled "I might be wrong", buttons Follow, Ignore, Why? (calls explain-hint, shows the text, logs hint_why),
Check (opens CardTracker.tsx, logs hint_checked). ChatPage.tsx for /coach. Use the logger from
frontend/src/game/logger.ts (create a temporary copy in src/coach/tmpLogger.ts with the same signature if it does
not exist yet, and delete it at integration). All texts plain and friendly.
```

---

## Task 3.4: Dashboard (Oct 26–28) ← UX 15% of the score

**What's on it, top to bottom:**
1. **Brain Twin radar:** 5 axes, the score as a filled shape and the low/high range as a lighter band. Under it, each dimension as "Memory 68% ± 6" with a small trend arrow. If `n_obs < 5`, show "still learning about you".
2. **Progress curves:** one line per dimension over time with the range as a shaded area; dimension toggles.
3. **What-if projection:** a slider "sessions per week" (1–7) that calls the projection endpoint; the band widens into the future; the disclaimer is always visible.
4. **Heatmap:** dimensions × time of day, colour = average score, empty cells grey.
5. **AI Collaboration Score:** the total and 5 bars, each with a one-line meaning and its n ("based on 11 hints").
6. **Goals:** set a target for one dimension, progress bar.
7. **Today's plan** card with the plan's reason sentence.
8. If `flags.suggest_break`: a gentle banner "You've been playing fast and the last moves were tough. A short break often helps."

**Prompt:**
```
In frontend/src/dashboard/ build DashboardPage.tsx (route /dashboard) with Recharts using GET profile, history,
projection, heatmap, collab, goals and plan from src/api/client.ts. Sections in this order: [paste the list
above]. Radar: one Radar series for score and two for low/high with low opacity. Progress: ComposedChart with
Area (low-high band) + Line (score) per dimension and toggle chips. Projection: slider 1-7 sessions/week,
refetch on change, band area, disclaimer text under the chart. Heatmap: CSS grid, colour scale from light to
Tunisian blue, null cells grey with "no data". Collab: total big number, 5 horizontal bars with one-line
explanations and "based on n events". Goals: form (dimension select + target) posting to /api/goals, progress
bars. Everything readable on a 390 px wide phone. Never use red for low scores; use neutral wording like
"room to grow". Test it with VITE_USE_MOCK=true.
```

---

## Task 3.5: Onboarding, consent, data page (Oct 27–28) ← safety 10%

**Prompt:**
```
In frontend/src/onboarding/ build: Welcome.tsx (what the app is in 3 short lines; "This is a game for training
thinking skills. It is not a medical test."), a 20-second rules carousel for Rami (4 slides from docs/rami-rules.md),
and Consent.tsx: what we record (moves, timings, mini-game answers, how you use the coach hints), what we never
record (camera, microphone, your name or contact details), how long we keep it (90 days), that the coach is an AI
that can be wrong, that you can export or delete everything at any time; checkboxes for "I agree" (required) and
"Use my anonymised data to improve the app" (optional); POST /api/consent and log consent_given. DataPage.tsx
(/data): Export my data (downloads the JSON from the export endpoint), Delete my data with a two-step in-page
confirmation, then clear localStorage and go back to /welcome. Also a short language choice (English, Français,
Derja) stored in localStorage and passed to the coach.
```

---

## Task 3.6: Report, slides, video (Oct 29–31, start the outlines on Oct 26)

**Report (max 8 pages, English).** You edit; each member writes their own sections (see their packs).
1. Problem and idea (½ p): why Rami, chess.com model, non-clinical. *(M3)*
2. System overview and architecture diagram (½ p) *(M3)*
3. Game engine and mini-games (1 p) *(M1)*
4. Assessment and uncertainty model (1 p) *(M2)*
5. Brain Twin and adaptation (½ p) *(M2)*
6. AI coach and explainability (1 p): prompts, evidence-only rule, guardrails, examples *(M3)*
7. AI Collaboration Score (½ p) *(M2)*
8. Dashboard and UX (½ p) *(M3)*
9. Data, ethics and safety (½ p) *(M2)*
10. Results on pilot users, limitations, future work (1 p) *(all)*: ask 5–10 friends to play for a few days, it gives you real curves and honest limitations

**Slides (max 15):** 1 title · 2 the problem · 3 Rami in 20 seconds · 4 our idea (loop) · 5 the five skills and their mini-games · 6 grading decisions, not luck · 7 Brain Twin with uncertainty · 8 the AI coach (screenshot of a review with evidence) · 9 the hint you can question · 10 AI Collaboration Score · 11 dashboard · 12 architecture · 13 ethics and data · 14 pilot results and limits · 15 roadmap and team.

**Video (3–5 min) script:**
- 0:00–0:20 hook: "Every Tunisian knows Rami. We turned it into a coach for your mind."
- 0:20–0:40 M1's rules intro
- 0:40–1:40 play a round on screen, ask a hint, press "Why?", ignore a weak hint
- 1:40–2:30 the review with evidence, the hint reveal, retry a position
- 2:30–3:20 a mini-game, then the dashboard: radar with ranges, curves, projection slider, collab score
- 3:20–3:50 consent and "delete my data"
- 3:50–4:20 architecture and what makes it different; close on the team

**Prompt for the outlines:**
```
Using docs/contracts.md, docs/scoring.md, docs/rami-rules.md and docs/data-and-ethics.md, draft
docs/report-outline.md with the 10 sections above, each with 3-5 bullet points of what to say and which figure
or screenshot to include, max 8 pages total. Then draft docs/video-script.md with the timeline above and the exact
lines to say.
```

## Your deadlines
| Date | Deliverable |
|---|---|
| Oct 20 | Vite app pushed (M1 needs it), mock mode working |
| Oct 24 | Coach review working on the fixture evidence, with template fallback |
| Oct 25 | **Integration 1**: shell mounts RamiTable, a real round produces a real review |
| Oct 28 | Hint panel, review screen, dashboard, onboarding, data page, voice |
| Oct 29 | **Feature freeze**, deploy frontend |
| Oct 30 | Record the video, assemble the report |
| Oct 31 | Slides, README with screenshots and "how to run", final check |
| Nov 1 | Submit |

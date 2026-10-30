# Data and ethics

What AI4Brain × Rami stores, why, for how long, and what players can do about it. Everything here describes what the code does; file references point to the implementation.

> **Not a medical test.** The app is a game for training thinking skills. It never diagnoses, labels or judges a person's health or intelligence, and its scores are not norms: they compare play in this app with reference values we chose (see `docs/scoring.md`).

## 1. Principles
1. **Data minimisation:** we store moves and timings, not people. No name, email, phone number, photo, voice or location.
2. **Non-biometric:** no camera, no microphone, no face or voice analysis. No decision is ever made from biometrics, because we collect none.
3. **Transparency:** every score is shown with its uncertainty range, every coach claim cites a recorded fact, and the hint panel always says "I might be wrong".
4. **Control:** players can export or delete everything, at any time, in two clicks.
5. **Non-clinical language:** the coach's output passes a blocked-word guardrail (diagnosis, disorder, deficit, IQ, patient…); see `backend/app/coach/guardrails.py`.

## 2. Consent
- On first visit the welcome page explains what is recorded and what never is, that the coach is an AI that can be wrong, and that data can be exported or deleted.
- **"I agree" is required** to play. A second, **optional** box allows using anonymised data to improve the app; it is off by default.
- The accepted **consent version** (`2026-10-v1`) and its time are stored (`POST /api/consent`). If the consent text changes, the version changes and players can be asked again.
- The player chooses a **nickname**. The backend refuses anything that looks like an email, a phone number or a link (`backend/app/privacy.py`), and the welcome page checks the same rules.

## 3. What we store

### On the server (SQLite database)
| Table | One row is | Contents | Why |
|---|---|---|---|
| `users` | a player | random id (UUID v4), nickname, consent version and time, analytics choice, last activity, demo flag | to link a player's events and record consent |
| `events` | one action | type, time, session, round, and a payload of game facts: cards played, think time in ms, missed lay-offs, hint use, memory-question answers… (contract §4) | raw input for the scores and the coach |
| `observations` | one 0–100 score of one skill from one round | dimension, value, measurement noise, time | the Brain Twin, kept even after raw events expire |
| `snapshots` | the profile after a round | five scores with ranges | progress curves |
| `goals` | a target the player set | dimension, target, starting score | goal tracking |
| `coachreview` | a cached coach review of one round | the review JSON | avoid paying for the same review twice |
| `deleted_users` | a deleted player | **only a SHA-256 hash** of the id, and the date | drop events that arrive after a deletion (e.g. from a closing tab) |

**Never stored:** chat message texts (the contract's chat event may carry only the message length and a "contained personal data" flag), names, contact details, audio, images. IP addresses are not stored in the database; the web server's console log shows them for operations only.

### In the player's browser (`localStorage`)
The random user id, the consent version, the house rules chosen on the Rules screen and the running match score. Clearing site data or "Delete my data" removes them.

## 4. The AI coach and the language model
- The coach's language model receives **only the evidence sheet** of a round: the facts the engine recorded (turn numbers, cards, scores). It never receives the nickname, and the user id is a random UUID with no meaning outside the app.
- Every key moment and tip must cite fact ids from that sheet. Items citing nothing, or a fact that does not exist, are removed before the player sees them. If the model fails, is slow (over 15 s) or is not configured, a **template review** is built from the same facts.
- In the coach chat, a message that looks like it contains an email, phone number or full name **is not sent to the model**; the player is reminded not to share personal data.
- The provider's own data policy applies to the evidence sheets sent to it. The key is a server-side environment variable, never shipped to the browser.

## 5. Live session
While a match is played, the table keeps a WebSocket to the backend (`/ws/session/{user_id}`) and streams the same events it would otherwise send in batches (`backend/app/live.py`). Only the app's own web origins may open a session, and a session accepts events for its own user only. The live coach's messages describe moves ("three quick discards in a row"), never the person.

## 6. Retention
Implemented in `backend/app/retention.py`; it runs at server start and then every 24 hours.

| Data | Kept for | Setting |
|---|---|---|
| Raw events | **90 days** | `RETENTION_DAYS` |
| A player with no activity | **180 days**, then everything about them is deleted | `INACTIVE_DAYS` |
| Derived scores (observations, snapshots) and goals | as long as the player is active | |
| Deletion tombstone (hash only) | indefinitely, contains nothing identifying | |

Simulated demo players are never removed for inactivity, so the demo stays available.

## 7. Export and deletion
- **Export:** "My data" → *Export my data* downloads one JSON file with the user row and every row of every table that has a `user_id` (`GET /api/data/{user_id}/export`).
- **Delete:** "My data" → *Delete my data* (two-step confirmation) removes every row of every such table, closes the live session, clears the browser's copy and returns to the welcome page (`DELETE /api/data/{user_id}`). New tables are covered automatically, because both operations find every table with a `user_id` column.

## 8. Demo data
The two demo players ("Demo improver (simulated)", "Demo newcomer (simulated)") are **generated by a script** (`backend/app/demo.py`), not real people. They are marked `is_demo` in the database and their nicknames say "simulated". Their events follow the contract and go through the real scoring pipeline, so the dashboard shows what a real three-week history would produce. Results reported from pilot users are reported separately from demo data.

## 9. Fairness and known limits
- **Placeholder references:** the 0–100 mappings use reference values we chose, not population norms. Two players with the same score did not necessarily play at the same level.
- **Rami familiarity:** experienced Rami players score higher at first, independently of the skill being measured.
- **Device and context:** think times depend on the device (touch or mouse), connection and distractions, so speed is the least reliable skill.
- **Wide ranges are honest:** with in-game signals only, each round is a noisy measurement, so ranges stay wide until a player has played several rounds. The app shows "still learning about you" below 5 measurements.
- **Access model:** there are no passwords. The random user id kept in the browser acts as the key to a player's data, so anyone who obtains it can read or delete that data. This is acceptable for a nickname-only prototype and would need real authentication before a public launch.
- **Not for decisions:** scores must not be used for hiring, schooling, health or any decision about a person.

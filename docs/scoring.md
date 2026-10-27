# Scoring and the Brain Twin

How AI4Brain × Rami turns play into a profile of five thinking skills, each with an honest range. Code: `backend/app/scoring/` (`observations.py`, `twin.py`, `pipeline.py`).

> This is a game and a training tool, not a psychological or medical assessment. Scores describe how someone played in this app, compared with reference values we chose; they are not norms and say nothing about a person's health or intelligence.

## 1. Overview

```
events ──► observations (0–100, with a noise level) ──► Brain Twin (score ± range per skill) ──► snapshots (history)
```

1. **Events.** Every move, mini-game answer and hint interaction is logged (`docs/contracts.md` §4).
2. **Observations.** Each finished mini-game, and each finished Rami round, is turned into one 0–100 measurement per skill it informs, each tagged with how noisy that kind of measurement is.
3. **Brain Twin.** For each skill we keep a *belief* about the player's true level: a best guess and an uncertainty. Every observation updates that belief with a Kalman filter.
4. **Snapshots.** After every round and mini-game we store the whole profile, which gives the history curves.

## 2. The five skills

| Skill | What we mean (in this game) | Mini-game | In-game signal |
|---|---|---|---|
| **Memory** | Keeping track of cards seen and taken | `card_recall`: rebuild a sequence of flashed cards | Recall probes ("which card did your opponent take?"), discards that fed the opponent |
| **Attention** | Noticing the opportunities in front of you | `meld_spotter`: find the one valid meld in a scrambled hand | Lay-offs, joker swaps and melds used vs. missed |
| **Speed** | Deciding quickly relative to how many options there are | `quick_match`: does this card fit the meld? | Think time per available option |
| **Reasoning** | Choosing the move that gets you out fastest | `rami_puzzle`: pick the best discard | Quality of each discard, graded against the best one |
| **Flexibility** | Letting go of a plan when the cards change | `rule_switch`: sort cards while the hidden rule changes | How long a stale plan is kept before switching |

Each mini-game adapts its level with a 2-up/1-down staircase (two correct in a row: harder; one wrong: easier), which keeps success near 71% so the level reached is informative.

## 3. From events to observations

All values are clipped to 0–100. **The reference values (the 7 in card recall, the 40 per minute in quick match, etc.) are placeholders to be tuned on pilot data.** The report states which values were tuned and how.

### Mini-games (noise r = 12)
Scored when `minigame_end` arrives, using the `trial` events of that game since the previous end of the same game in the session.

| Game | Observation | Notes |
|---|---|---|
| `card_recall` | (span reached − 2) / 7 × 100 | Span reached = longest correctly recalled sequence (trial `extra.span`); fallback `score_raw`, then `level_end`. Span 2 → 0, span 9 → 100 |
| `meld_spotter` | (hit rate − false-alarm rate) × 100 + 5 × level | From trial extras `hits/targets` and `false_alarms/decoys`; fallback: accuracy as hit rate, no false alarms |
| `quick_match` | correct per minute / 40 × 100 | Game lasts 45 s unless `duration_ms` is sent; 40 correct per minute → 100 |
| `rami_puzzle` | accuracy × 60 + level × 4 | |
| `rule_switch` | 100 − 12 × mean trials to adapt | Trials needed after each hidden rule change (trial `extra.trials_to_adapt`). No rule change → no observation |
| any new game | accuracy × 100 | Lets a new mini-game for a new skill plug in without backend changes |

### Rami rounds (noise r = 25)
Scored once `round_end` is stored, from all events of the round. Rounds are noisier than mini-games because luck matters and every skill is mixed together, so one round moves the profile less than one mini-game.

| Skill | Observation |
|---|---|
| Memory | recall-probe accuracy × 100 − 10 × discards that fed the opponent (no probe → no observation) |
| Attention | 100 × (1 − missed / (missed + used)), counting lay-offs, joker swaps and melds |
| Speed | 100 × clamp(1 − (median think time per option − 300 ms) / 1500 ms) |
| Reasoning | mean turn quality × 100. Quality comes from the turn grader (`turn_graded`), which runs after the round; the round is re-scored when grades arrive |
| Flexibility | 100 − 20 × mean turns waited before a plan switch (no switch → no observation) |

Turn quality is defined by the grader (`docs/rami-rules.md`): `quality = 1 − (T_played − T_best) / max(1, T_worst − T_best)`, where T is the expected number of turns to go out after a discard, estimated by Monte Carlo simulation of the hidden cards. This grades the **decision** given what was visible, not the luck of the draw.

## 4. The Brain Twin: a belief per skill

For each skill we believe the player's true level θ follows a normal distribution with mean μ and standard deviation σ (0–100 scale).

**Start.** μ = 50, σ = 25. The displayed range is 1–99: we know nothing yet.

**Update (Kalman filter).** An observation x with noise r moves the belief:

```
K  = σ² / (σ² + r²)          how much to trust the new observation (0 to 1)
μ ← μ + K · (x − μ)          move the guess toward the observation
σ² ← (1 − K) · σ²            become more certain
```

When we know little (σ large), K is close to 1 and the first observations move the score a lot. As evidence builds up, K shrinks and each new game nudges the score instead of overwriting it. A noisy observation (large r, a Rami round) gets a smaller K than a precise one (a mini-game).

**Drift.** People change, so before each update the uncertainty grows with time since the last observation of that skill:

```
σ² ← σ² + q² · days        q = 2
```

The twin therefore keeps learning instead of freezing after many games, and the displayed range widens while the player is away ("we are less sure about you after a month off").

**Displayed range.** μ ± 1.96 σ, clipped to 0–100: a 95% range. "Memory 68% ± 6" means a range of 62–74.

**Example.** A new player scores 80 on `card_recall` (r = 12): K = 625 / (625 + 144) = 0.81, so μ = 50 + 0.81 × 30 = 74.4 and σ = 10.8 (range 53–96). After ten games at 80 on the same day, μ ≈ 79 and the range is about ± 7.

**Trend.** The change in μ over the last 7 days (μ now − μ as it was 7 days ago). It is 0 until there is a week of history, so a new player never sees an invented trend.

**Counts.** `n_obs` is the number of observations behind a skill; the dashboard says "still learning about you" below 5.

## 5. History and storage

- Observations are stored in their own table, keyed by their source (`round:<round_id>:<skill>` or `minigame:<event_id>:<skill>`). Re-scoring a round replaces its observations, so a late `turn_graded` or a re-sent batch never counts twice.
- After each batch, the twin is replayed from all the player's observations in time order and the snapshot history is rewritten: one snapshot after each round or mini-game. The history therefore always matches the current formulas.
- Raw events are deleted after the retention period (90 days); observations are kept, so the profile and its history survive. Deleting one's data removes everything, observations and snapshots included.

## 6. Known biases and limitations

- **Placeholder references.** The 0–100 mappings use reference values we chose, not population norms. Two mappings that both give "60" are not guaranteed to mean the same level of skill. We tune them on pilot users and say so.
- **Game familiarity.** Players who already know Rami well will score higher on in-game signals at first, independently of the skill measured. Mini-games carry more weight (lower noise) partly for this reason.
- **Mixed skills.** A Rami round never measures one skill in isolation: a slow turn may be careful reasoning, not low speed. The higher noise (r = 25) encodes this.
- **Device and context.** Think times depend on the device (touch vs. mouse), connection and distractions. Speed is the skill most affected.
- **Practice effects.** Scores rise with familiarity with each mini-game itself; part of a rising curve is learning the game, not the underlying skill.
- **Model assumptions.** The Kalman filter assumes measurement errors are independent and normally distributed, and that skills change slowly (q = 2 per √day). Neither is exactly true; the range is an honest estimate under these assumptions, not a guarantee.
- **Grader approximation.** Turn quality relies on a Monte Carlo estimate with a limited number of samples, so it has its own noise.

## 7. Parameters

| Parameter | Value | Where |
|---|---|---|
| Prior | μ = 50, σ = 25 | `twin.py` `PRIOR_MU`, `PRIOR_SIGMA` |
| Drift | q = 2 per √day | `twin.py` `DRIFT_Q` |
| Range | 95% (z = 1.96) | `twin.py` `Z95` |
| Mini-game noise | r = 12 | `observations.py` `R_MINIGAME` |
| Round noise | r = 25 | `observations.py` `R_ROUND` |
| Trend window | 7 days | `twin.py` `TREND_WINDOW` |

## 8. What-if projection

`GET /api/profile/{user_id}/projection?sessions_per_week=3&weeks=4` (`scoring/projection.py`).

- **Gain per session:** for each skill, the least-squares slope of the user's mean μ after each of their last 10 sessions, clamped to 0–2 points per session. With fewer than 3 sessions the gain is 0: we don't extrapolate from almost nothing.
- **Week w:** score = μ + gain × sessions_per_week × w. Half-width of the range = 1.96 σ + 3 × w, so the band widens the further it looks.
- Every projection carries the disclaimer *"Estimate based on your own past progress. Not a prediction of ability."*

## 9. Heatmap, goals and the training plan

- **Heatmap** (`scoring/heatmap.py`): the average observation value per skill and time of day (08–12, 12–16, 16–20, 20–24, 00–08, Tunisia time). Empty cells are `null`.
- **Goals** (`scoring/goals.py`): one target per skill. When a goal is set we store today's μ as its baseline; progress = (μ now − baseline) / (target − baseline), clipped to 0–1.
- **Plan** (`scoring/adaptive.py`):
  - Focus = the skill with the highest need = (100 − μ) + 0.5 × (high − low), so weak *and* uncertain skills get trained.
  - Steps: the focus mini-game, a Rami round, the mini-game of the most uncertain other skill, the focus mini-game again. Each mini-game starts at the level the user ended it last time.
  - Opponent level 1–5: starts at 2, +1 after 2 wins in a row, −1 after 2 losses in a row.
  - Quick round when the last 3 sessions were each under 10 minutes (and for new users).
- **Break suggestion** (`scoring/frustration.py`): `suggest_break` is true when the last round had 3 turns in a row under 1.5 s with quality below 0.4, or was abandoned, or the user lost 3 rounds in a row today. The next plan then lowers the opponent by one level.

## 10. AI Collaboration Score

`GET /api/collab/{user_id}` (`scoring/collab.py`), from the coach events of the user's last 10 sessions. Each component is 0–100 and comes with `n`, the number of events it is based on.

| Component (weight) | Formula |
|---|---|
| Clarification (20%) | % of shown hints the user questioned ("Why?" or a chat question) before acting |
| Verification (25%) | Calibrated trust: % of hints where the decision was right (followed a good hint or ignored a bad one); +10 (max 100) if the user pressed "Check" on a hint below 60% confidence |
| Iteration (20%) | (positions retried + reviews opened) / finished rounds, max 100 |
| Autonomy (20%) | 100 × (1 − hints requested / turns played) |
| Responsible use (15%) | 100, −10 per hint asked in the first 2 s of a turn, −10 per burst of 3+ hints within 3 turns, −20 per chat message with personal data |

**Total** = Σ weight × score / Σ weights of the components that have data. A component with no data is `null` and left out, so someone who never asks for a hint is not punished for it.

**Why these components:** a good collaborator with an AI asks why, checks before trusting (especially when the AI says it is unsure), learns from mistakes, still plays on their own, and uses the assistant responsibly. Verification has the biggest weight because blindly following a weak hint is the behaviour we most want to discourage.

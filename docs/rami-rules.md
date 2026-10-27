# Our Rami rules

House rules for Tunisian Rami vary between families and cafés. These are the rules the game engine (`frontend/src/engine/`) enforces. Summary in `docs/contracts.md` §7.

## Players and cards
- **2 players:** you and the AI opponent.
- **Standard round:** two 52-card decks + 4 jokers = **108 cards**. Each player is dealt **14 cards**; the first player gets **15** and starts by discarding one.
- **Quick round:** one deck + 2 jokers = 54 cards, **10 cards** each (11 for the first player), opening minimum **40**.
- The deal comes from a seeded shuffle, so a seed always replays the same round (used for reviews and puzzles).

## A turn
1. **Draw** one card: from the **stock** (face down), or the **top of the discard pile**.
   - You may take the top discard **only if you lay it down in the same turn** (in a meld, or on the table once opened). The table refuses to let you take it otherwise, so you can never get stuck with it.
2. **Play** (optional): lay down melds, lay off cards, swap jokers.
3. **Discard** one card face up. This ends your turn.

## Melds
| Meld | Rule | Examples |
|---|---|---|
| **Set** | 3 or 4 cards of the **same rank**, all **different suits** | 7♠ 7♥ 7♦ ✓ · 7♠ 7♥ 7♦ 7♣ ✓ · 9♣ 9♥ 9♣ ✗ (two clubs) |
| **Run** | 3 or more **consecutive** cards of the **same suit** | 4♥ 5♥ 6♥ 7♥ ✓ · 4♥ 5♠ 6♥ ✗ |

- **Ace** is low (A-2-3) or high (Q-K-A), but a run never wraps around: K-A-2 ✗.
- **Joker:** replaces any card, **at most one joker per meld**. 9♠ JK J♠ ✓ (the joker is the 10♠) · 5♦ JK JK ✗.

## Opening
Your **first lay-down** must be worth at least **71 points** (40 in a quick round), in one go.

| Card | Points |
|---|---|
| 2 to 10 | face value |
| J, Q, K | 10 |
| Ace | 11, or 1 in A-2-3 |
| Joker | the value of the card it replaces |

**Example:** Q♠ K♠ A♠ = 10 + 10 + 11 = 31, and T♥ T♦ T♣ T♠ = 40. Together 71: just enough to open.

## After opening
- **Lay down** more melds of any value.
- **Lay off:** add cards to **any** meld on the table, yours or your opponent's (7♣ onto 7♠ 7♥ 7♦; 8♥ onto 5♥ 6♥ 7♥).
- **Joker swap:** if you hold the real card a table joker stands for, place it and take the joker. The joker must be **used in the same turn**, so the swap is only allowed when that is possible.

## Going out and penalties
- You **go out** by laying down all your cards, or by discarding your last one. The round ends at once.
- The other player scores **penalty points** for every card left in hand: face value, J/Q/K 10, ace 11, **joker 25**.
- A player who **never opened** takes **100**.
- Fewer points is better.
- If the stock runs out, the discard pile (except its top card) is shuffled into a new stock.

## The AI opponent (levels 1–5)
| Level | How it plays |
|---|---|
| 1 | Random legal discard |
| 2 | Greedy: takes the discard only if it helps, lays down as soon as legal, discards the highest card in no meld and near no meld |
| 3 | Level 2 + memory: avoids discards that fit what you collected or a table meld |
| 4 | Level 3 + one-step lookahead over every possible next draw |
| 5 | Monte Carlo: plays out sampled futures for the four best level-4 candidates |

The AI only sees what a real player sees: its own hand, the table, the discard pile and what each player took from it. Tests check that level 5 beats level 1 in at least 70% of quick rounds and that levels 1–4 decide in under 300 ms.

## Grading decisions, not luck
After the round, a Web Worker grades every discard you made. For each possible discard *d*, the grader estimates **T(d)**, the expected number of turns still needed to go out after discarding *d* and drawing the next card. It averages over every card you had not seen, so the luck of the actual draw does not count. Then:

```
quality = 1 − (T_played − T_best) / max(1, T_worst − T_best)
```

The best discard scores 1, the worst scores 0. Each graded turn is sent as a `turn_graded` event with `quality`, `best_discard`, `turns_to_out_played` and `turns_to_out_best`.

## Hints
- The hint engine deliberately uses the faster level-4 logic. It also weighs what your opponent collects, so it is sometimes not the grader's best move.
- Its **confidence** is the share of 30 sampled next draws for which the hinted card was also the best discard. The panel shows it next to the words "I might be wrong".
- After the round, a discard hint counts as good (`hint_outcome`) if the hinted card is within 0.3 turns of the best.

## What the table records
Every action becomes an event (`docs/contracts.md` §4):

| Event | When | Notes |
|---|---|---|
| `round_start` | the round begins | |
| `turn` | each of your turns | think time, number of options, missed lay-offs, joker swaps and melds, and whether your discard fed the opponent (known once they draw) |
| `recall_probe` | about once every 6 turns | "Which card did your opponent take / discard last turn?" with 4 choices |
| `plan_switch` | you move from building runs to sets (or back) | how many turns the old plan stalled first |
| hint events | while you use hints | `hint_requested`, `hint_shown`, `hint_why`, `hint_checked`, `hint_followed`, then `hint_outcome` after the round |
| `round_end` | the round ends | also when you leave mid-round (`abandoned: true`) |
| `turn_graded` | after the round | from the grader |

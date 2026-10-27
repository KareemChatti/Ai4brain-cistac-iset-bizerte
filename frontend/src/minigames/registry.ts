// The mini-game registry. Adding a game for a new skill = one new component + one entry here
// (see docs/how-to-add-a-minigame.md).

import { CardRecall } from "./games/CardRecall";
import { MeldSpotter } from "./games/MeldSpotter";
import { QuickMatch } from "./games/QuickMatch";
import { RamiPuzzle } from "./games/RamiPuzzle";
import { RuleSwitch } from "./games/RuleSwitch";
import type { MiniGameDefinition } from "./types";

const correctCount = (trials: { correct: boolean }[]) => trials.filter((t) => t.correct).length;

export const MINIGAMES: Record<string, MiniGameDefinition> = {
  card_recall: {
    id: "card_recall",
    dimension: "memory",
    title: "Card recall",
    instructions: [
      "Cards appear one at a time.",
      "Then tap them in the same order.",
      "Each success makes the next sequence longer.",
    ],
    minLevel: 3,
    maxLevel: 9,
    durationMs: 60_000,
    // Longest sequence recalled correctly (the backend scores (span - 2) / 7).
    scoreRaw: (trials) => Math.max(0, ...trials.filter((t) => t.correct).map((t) => Number(t.extra?.span ?? t.level))),
    Component: CardRecall,
  },
  meld_spotter: {
    id: "meld_spotter",
    dimension: "attention",
    title: "Meld spotter",
    instructions: [
      "Twelve cards hide exactly one valid set or run of three.",
      "Tap its three cards before the timer runs out.",
      "The timer gets shorter and the decoys trickier as you improve.",
    ],
    minLevel: 1,
    maxLevel: 8,
    durationMs: 60_000,
    scoreRaw: correctCount,
    Component: MeldSpotter,
  },
  quick_match: {
    id: "quick_match",
    dimension: "speed",
    title: "Quick match",
    instructions: [
      "You see a meld and one card.",
      "Say as fast as you can whether the card can be added to the meld.",
      "Keyboard: F = fits, J = doesn't fit.",
    ],
    minLevel: 1,
    maxLevel: 8,
    durationMs: 45_000,
    // Correct answers per minute.
    scoreRaw: (trials) => correctCount(trials) / 0.75,
    Component: QuickMatch,
  },
  rami_puzzle: {
    id: "rami_puzzle",
    dimension: "reasoning",
    title: "Rami puzzle",
    instructions: [
      "You see a hand after drawing.",
      "Pick the discard that gets you out of cards the fastest.",
      "Hands get bigger, with jokers and closer choices, as you improve.",
    ],
    minLevel: 1,
    maxLevel: 8,
    durationMs: 60_000,
    scoreRaw: correctCount,
    Component: RamiPuzzle,
  },
  rule_switch: {
    id: "rule_switch",
    dimension: "flexibility",
    title: "Rule switch",
    instructions: [
      "Decide whether each card goes with the reference card.",
      "A hidden rule decides; find it from the feedback.",
      "The rule changes without warning. Notice it and adapt.",
    ],
    minLevel: 1,
    maxLevel: 6,
    durationMs: 60_000,
    // Mean trials needed to adapt after a rule change (lower is better).
    scoreRaw: (trials) => {
      const adapt = trials.map((t) => t.extra?.trials_to_adapt).filter((x): x is number => typeof x === "number");
      return adapt.length ? adapt.reduce((a, b) => a + b, 0) / adapt.length : 0;
    },
    Component: RuleSwitch,
  },
};

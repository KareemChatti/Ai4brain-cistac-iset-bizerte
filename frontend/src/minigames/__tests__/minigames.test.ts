import { describe, expect, it } from "vitest";
import { mulberry32, parseCard } from "../../engine/cards";
import { canLayOff, isValidMeld } from "../../engine/melds";
import {
  RULES_BY_LEVEL,
  fitsRule,
  isBestDiscard,
  meldSpotterHand,
  puzzlePosition,
  quickMatchTrial,
  recallSequence,
  ruleSwitchTrial,
  spotterSeconds,
} from "../generators";
import { MINIGAMES } from "../registry";
import { stepStaircase } from "../useStaircase";

const rng = mulberry32(2026);

describe("staircase (2-up / 1-down)", () => {
  it("goes up after two correct and down after one wrong, within bounds", () => {
    let s = { level: 3, streak: 0 };
    s = stepStaircase(s.level, s.streak, true, 1, 5);
    expect(s.level).toBe(3);
    s = stepStaircase(s.level, s.streak, true, 1, 5);
    expect(s.level).toBe(4);
    s = stepStaircase(s.level, s.streak, false, 1, 5);
    expect(s.level).toBe(3);
    expect(stepStaircase(1, 0, false, 1, 5).level).toBe(1);
    expect(stepStaircase(5, 1, true, 1, 5).level).toBe(5);
  });
});

describe("generators", () => {
  it("card_recall: distinct cards of the requested length", () => {
    const seq = recallSequence(7, rng);
    expect(seq).toHaveLength(7);
    expect(new Set(seq).size).toBe(7);
  });

  it("meld_spotter: exactly one valid meld among 12 cards, at every level", () => {
    for (let level = 1; level <= 8; level++) {
      for (let i = 0; i < 10; i++) {
        const { cards, meld } = meldSpotterHand(level, rng);
        expect(cards).toHaveLength(12);
        expect(isValidMeld(meld.map(parseCard))).toBe(true);
        const all = cards.map(parseCard);
        let count = 0;
        for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) if (isValidMeld([all[a], all[b], all[c]])) count++;
        expect(count).toBe(1);
      }
    }
    expect(spotterSeconds(1)).toBe(10);
    expect(spotterSeconds(8)).toBe(4.05);
  });

  it("quick_match: the answer is right and both answers occur", () => {
    const answers = new Set<boolean>();
    for (let i = 0; i < 60; i++) {
      const t = quickMatchTrial(4, rng);
      expect(canLayOff(parseCard(t.card), t.meld.map(parseCard))).toBe(t.fits);
      answers.add(t.fits);
    }
    expect(answers.size).toBe(2);
  });

  it("rami_puzzle: the best discard is the grader's best, built quickly", () => {
    for (const level of [1, 4, 8]) {
      const start = performance.now();
      const p = puzzlePosition(level, rng);
      expect(performance.now() - start).toBeLessThan(3000);
      expect(p.hand).toContain(p.best);
      expect(isBestDiscard(p.best, p)).toBe(true);
    }
  }, 30_000);

  it("rule_switch: rules and trials agree", () => {
    expect(fitsRule("colour", "7H.1", "2D.1")).toBe(true);
    expect(fitsRule("rank", "7H.1", "7S.1")).toBe(true);
    expect(fitsRule("neighbour", "7H.1", "8H.1")).toBe(true);
    expect(fitsRule("neighbour", "7H.1", "9H.1")).toBe(false);
    expect(fitsRule("suit", "7H.1", "KH.1")).toBe(true);
    for (const rule of RULES_BY_LEVEL(6)) {
      const t = ruleSwitchTrial(rule, rng);
      expect(fitsRule(rule, t.reference, t.card)).toBe(t.fits);
    }
    expect(RULES_BY_LEVEL(1)).toHaveLength(2);
  });
});

describe("registry", () => {
  it("has the five contract games with valid levels", () => {
    expect(Object.keys(MINIGAMES).sort()).toEqual(["card_recall", "meld_spotter", "quick_match", "rami_puzzle", "rule_switch"]);
    for (const def of Object.values(MINIGAMES)) {
      expect(def.minLevel).toBeLessThanOrEqual(def.maxLevel);
      expect(def.durationMs).toBeGreaterThan(0);
    }
    expect(MINIGAMES.quick_match.durationMs).toBe(45_000);
  });

  it("score_raw matches what the backend expects", () => {
    const recall = MINIGAMES.card_recall.scoreRaw([
      { correct: true, rtMs: 1, level: 4, extra: { span: 4 } },
      { correct: true, rtMs: 1, level: 5, extra: { span: 5 } },
      { correct: false, rtMs: 1, level: 6, extra: { span: 6 } },
    ]);
    expect(recall).toBe(5);
    const adapt = MINIGAMES.rule_switch.scoreRaw([
      { correct: true, rtMs: 1, level: 1, extra: { trials_to_adapt: 2 } },
      { correct: true, rtMs: 1, level: 1, extra: { trials_to_adapt: 4 } },
    ]);
    expect(adapt).toBe(3);
  });
});

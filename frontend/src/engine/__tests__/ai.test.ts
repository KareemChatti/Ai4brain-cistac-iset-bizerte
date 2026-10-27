import { describe, expect, it } from "vitest";
import { QUICK_CONFIG, FULL_CONFIG, mulberry32 } from "../cards";
import { Level, chooseAction, playTurn } from "../ai";
import { GameState, newGame } from "../state";

function match(seed: number, levels: [Level, Level]): GameState {
  const rng = mulberry32(seed);
  let s = newGame(seed, QUICK_CONFIG, (seed % 2) as 0 | 1);
  for (let turns = 0; turns < 600 && s.phase !== "over"; turns++) {
    s = playTurn(s, levels[s.current], rng).state;
  }
  return s;
}

describe("AI opponent", () => {
  it("every level finishes rounds against itself", () => {
    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      for (let seed = 1; seed <= 4; seed++) expect(match(seed, [level, level]).phase).toBe("over");
    }
  }, 120_000);

  it("level 5 beats level 1 in at least 70% of quick rounds", () => {
    let wins = 0;
    const rounds = 40;
    for (let seed = 1; seed <= rounds; seed++) {
      const strongFirst = seed % 2 === 0;
      const end = match(seed, strongFirst ? [5, 1] : [1, 5]);
      if (end.winner === (strongFirst ? 0 : 1)) wins++;
    }
    expect(wins / rounds).toBeGreaterThanOrEqual(0.7);
  }, 300_000);

  it("levels 1-4 decide within 300 ms, level 5 within 2 s, on a full deal", () => {
    const s = newGame(99, FULL_CONFIG);
    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      const start = performance.now();
      chooseAction(s, level, mulberry32(1));
      const ms = performance.now() - start;
      expect(ms).toBeLessThan(level === 5 ? 2000 : 300);
    }
  });
});

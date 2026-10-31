import { afterEach, describe, expect, it } from "vitest";
import { FULL_CONFIG, GameConfig, parseCard } from "../cards";
import { coachAlerts, feedsOpponent } from "../coach";
import { isValidRun, setMeldRules } from "../melds";
import { applyAction, scoreRound } from "../rules";
import { GameState, TableMeld, newGame } from "../state";

const c = (...ids: string[]) => ids.map((id) => parseCard(id.includes(".") ? id : `${id}.1`));
const meld = (id: number, owner: 0 | 1, ...ids: string[]): TableMeld => ({ id, owner, kind: "run", cards: c(...ids) });

function position(hand0: string[], rest: Partial<Omit<GameState, "config">> & { config?: Partial<GameConfig> } = {}): GameState {
  const config = { ...FULL_CONFIG, ...rest.config };
  return {
    ...newGame(1, config),
    hands: [c(...hand0), c("2C", "3D", "4S")],
    discard: [],
    stock: c("9D", "8D", "7D"),
    phase: "play",
    current: 0,
    ...rest,
    config,
  };
}

afterEach(() => setMeldRules(FULL_CONFIG));

describe("house rules", () => {
  it("uses the configured penalties", () => {
    const s = { ...position(["JK.1", "5H"], { opened: [true, false], winner: 1 }), config: { ...FULL_CONFIG, jokerPenalty: 50, neverOpenedPenalty: 150 } };
    expect(scoreRound(s)).toEqual([55, 0]);
    expect(scoreRound({ ...s, opened: [false, false] })[0]).toBe(150);
  });

  it("lets you take any discard when the must-use rule is off", () => {
    const base = position(["2H", "9C"], { phase: "draw", discard: c("KS") });
    expect(() => applyAction(base, { type: "drawDiscard" })).toThrow();
    const free = position(["2H", "9C"], { phase: "draw", discard: c("KS"), config: { discardMustBeUsed: false } });
    const next = applyAction(free, { type: "drawDiscard" });
    expect(next.mustUse).toEqual([]);
    expect(next.hands[0]).toHaveLength(3);
  });

  it("can forbid joker swaps", () => {
    const table = [meld(1, 1, "5H", "JK.1", "7H")];
    const s = position(["6H", "8H", "9H", "KC"], { opened: [true, true], table, config: { jokerSwap: false } });
    expect(() => applyAction(s, { type: "swapJoker", cardId: "6H.1", meldId: 1 })).toThrow(/turned off/);
  });

  it("can require a final discard to go out", () => {
    const s = position(["5H", "6H", "7H"], { opened: [true, false], config: { mustDiscardToGoOut: true } });
    expect(() => applyAction(s, { type: "layDown", melds: [["5H.1", "6H.1", "7H.1"]] })).toThrow(/Keep one card/);
    const out = applyAction(position(["KC"], { opened: [true, false], config: { mustDiscardToGoOut: true } }), { type: "discard", cardId: "KC.1" });
    expect(out.winner).toBe(0);
  });

  it("can turn off the high ace", () => {
    expect(isValidRun(c("QS", "KS", "AS"))).toBe(true);
    setMeldRules({ aceHigh: false });
    expect(isValidRun(c("QS", "KS", "AS"))).toBe(false);
    expect(isValidRun(c("AS", "2S", "3S"))).toBe(true);
  });
});

describe("live coach", () => {
  it("spots a missed lay-off and a reachable opening", () => {
    const opened = position(["8H", "KC"], { opened: [true, false], table: [meld(1, 1, "5H", "6H", "7H")] });
    expect(coachAlerts(opened, 0, null).map((a) => a.kind)).toEqual(["missed_lay_off"]);
    const closed = position(["TS", "TH", "TD", "TC", "QC", "KC", "AC", "2D"]);
    expect(coachAlerts(closed, 0, null).map((a) => a.kind)).toEqual(["opening_reachable"]);
  });

  it("warns when a discard completes a meld with cards the opponent took", () => {
    const s = position(["9S", "2D"], { taken: [[], c("9H", "9D")] });
    expect(feedsOpponent(s, 0, parseCard("9S.1"))).toMatch(/took 9H and 9D/);
    expect(feedsOpponent(s, 0, parseCard("2D.1"))).toBeNull();
    expect(coachAlerts(s, 0, parseCard("9S.1")).map((a) => a.kind)).toEqual(["feeds_opponent"]);
  });

  it("says nothing outside the player's play phase", () => {
    const s = position(["8H"], { opened: [true, false], table: [meld(1, 1, "5H", "6H", "7H")], phase: "draw" });
    expect(coachAlerts(s, 0, null)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { FULL_CONFIG, QUICK_CONFIG, mulberry32, parseCard } from "../cards";
import { Action, RuleError, applyAction, legalActions, scoreRound } from "../rules";
import { GameState, newGame } from "../state";

const c = (...ids: string[]) => ids.map((id) => parseCard(id.includes(".") ? id : `${id}.1`));

function position(
  hand0: string[],
  { hand1 = ["2C", "3D", "4S"], discard = [], ...rest }: Partial<Omit<GameState, "discard">> & { hand1?: string[]; discard?: string[] } = {},
): GameState {
  return {
    ...newGame(1, FULL_CONFIG),
    hands: [c(...hand0), c(...hand1)],
    discard: c(...discard),
    stock: c("9D", "8D", "7D"),
    phase: "play",
    current: 0,
    ...rest,
  };
}

describe("dealing", () => {
  it("deals 14 and 15 from two decks plus four jokers", () => {
    const s = newGame(42, FULL_CONFIG);
    expect(s.hands[0]).toHaveLength(15);
    expect(s.hands[1]).toHaveLength(14);
    expect(s.stock.length + 29).toBe(108);
    expect(s.phase).toBe("play");
  });
  it("replays the same deal from the same seed", () => {
    expect(newGame(7, FULL_CONFIG).hands[0].map((x) => x.id)).toEqual(newGame(7, FULL_CONFIG).hands[0].map((x) => x.id));
    expect(newGame(7, FULL_CONFIG).hands[0]).not.toEqual(newGame(8, FULL_CONFIG).hands[0]);
  });
  it("deals 10 from one deck in quick mode", () => {
    const s = newGame(1, QUICK_CONFIG);
    expect(s.hands[1]).toHaveLength(10);
    expect(s.stock.length + 21).toBe(54);
  });
});

describe("opening", () => {
  it("requires 71 points on the first lay-down", () => {
    const s = position(["QS", "KS", "AS", "TH", "TD", "TC", "TS", "4C"]);
    const after = applyAction(s, { type: "layDown", melds: [["QS.1", "KS.1", "AS.1"], ["TH.1", "TD.1", "TC.1", "TS.1"]] });
    expect(after.opened[0]).toBe(true);
    expect(after.table).toHaveLength(2);
    expect(() => applyAction(s, { type: "layDown", melds: [["QS.1", "KS.1", "AS.1"]] })).toThrow(/71/);
  });
  it("rejects invalid melds", () => {
    const s = position(["KS", "AS", "2S", "4C"]);
    expect(() => applyAction(s, { type: "layDown", melds: [["KS.1", "AS.1", "2S.1"]] })).toThrow(RuleError);
  });
});

describe("taking the discard", () => {
  it("is allowed only if the card can be laid down this turn", () => {
    const useful = position(["QS", "KS", "TH", "TD", "TC", "TS", "4C"], { phase: "draw", discard: ["AS"] });
    expect(() => applyAction(useful, { type: "drawDiscard" })).not.toThrow();
    const useless = position(["QS", "KS", "TH", "TD", "TC", "TS", "4C"], { phase: "draw", discard: ["5H"] });
    expect(() => applyAction(useless, { type: "drawDiscard" })).toThrow(/lay it down/);
  });
  it("must be laid down before discarding", () => {
    let s = position(["QS", "KS", "TH", "TD", "TC", "TS", "4C"], { phase: "draw", discard: ["AS"] });
    s = applyAction(s, { type: "drawDiscard" });
    expect(() => applyAction(s, { type: "discard", cardId: "4C.1" })).toThrow(/AS/);
    s = applyAction(s, { type: "layDown", melds: [["QS.1", "KS.1", "AS.1"], ["TH.1", "TD.1", "TC.1", "TS.1"]] });
    expect(() => applyAction(s, { type: "discard", cardId: "4C.1" })).not.toThrow();
  });
});

describe("after opening", () => {
  const opened = (hand: string[], table: string[][]): GameState => ({
    ...position(hand),
    opened: [true, false],
    table: table.map((ids, i) => ({ id: i + 1, owner: 1 as const, kind: "run" as const, cards: c(...ids) })),
  });

  it("lays off on any meld", () => {
    const s = applyAction(opened(["8H", "2C"], [["5H", "6H", "7H"]]), { type: "layOff", cardId: "8H.1", meldId: 1 });
    expect(s.table[0].cards.map((x) => x.id)).toEqual(["5H.1", "6H.1", "7H.1", "8H.1"]);
  });
  it("cannot lay off before opening", () => {
    const s = { ...opened(["8H", "2C"], [["5H", "6H", "7H"]]), opened: [false, false] as [boolean, boolean] };
    expect(() => applyAction(s, { type: "layOff", cardId: "8H.1", meldId: 1 })).toThrow(/opening/);
  });
  it("swaps a joker, and the joker must be used the same turn", () => {
    let s = opened(["4C", "9D", "TD", "2S"], [["3C", "JK.1", "5C"]]);
    s = applyAction(s, { type: "swapJoker", cardId: "4C.1", meldId: 1 });
    expect(s.table[0].cards.map((x) => x.id)).toEqual(["3C.1", "4C.1", "5C.1"]);
    expect(s.hands[0].some((x) => x.joker)).toBe(true);
    expect(() => applyAction(s, { type: "discard", cardId: "2S.1" })).toThrow(/JK/);
    s = applyAction(s, { type: "layDown", melds: [["9D.1", "TD.1", "JK.1"]] });
    expect(() => applyAction(s, { type: "discard", cardId: "2S.1" })).not.toThrow();
  });
  it("refuses a swap whose joker could not be used", () => {
    const s = opened(["KC", "2S", "8H"], [["KS", "KH", "KD", "JK.1"]]);
    expect(() => applyAction(s, { type: "swapJoker", cardId: "KC.1", meldId: 1 })).toThrow(/joker/);
  });
});

describe("going out and penalties", () => {
  it("ends the round when the last card is discarded", () => {
    const s = applyAction({ ...position(["2C"]), opened: [true, false] }, { type: "discard", cardId: "2C.1" });
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(0);
  });
  it("scores cards left, joker 25, and 100 if never opened", () => {
    const s: GameState = {
      ...position([]),
      hands: [[], c("KD", "7C", "JK.1")],
      opened: [true, true],
      winner: 0,
      phase: "over",
    };
    expect(scoreRound(s)).toEqual([0, 42]);
    expect(scoreRound({ ...s, opened: [true, false] })).toEqual([0, 100]);
  });
});

function randomRound(seed: number, quick: boolean): GameState {
  const rng = mulberry32(seed * 31 + 1);
  let s = newGame(seed, quick ? QUICK_CONFIG : FULL_CONFIG, (seed % 2) as 0 | 1);
  for (let steps = 0; steps < 5000 && s.phase !== "over"; steps++) {
    const actions = legalActions(s);
    expect(actions.length).toBeGreaterThan(0);
    const pick = (type: Action["type"]) => actions.filter((a) => a.type === type);
    const options = pick("layDown").length ? pick("layDown") : rng() < 0.7 && pick("layOff").length ? pick("layOff") : actions;
    s = applyAction(s, options[Math.floor(rng() * options.length)]);
    const total = s.stock.length + s.discard.length + s.hands[0].length + s.hands[1].length + s.table.reduce((n, m) => n + m.cards.length, 0);
    expect(total).toBe(quick ? 54 : 108);
  }
  return s;
}

describe("whole rounds", () => {
  it("200 random rounds always finish with a legal state", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const end = randomRound(seed, seed % 2 === 0);
      expect(end.phase).toBe("over");
      expect(end.winner).not.toBeNull();
    }
  }, 120_000);
});

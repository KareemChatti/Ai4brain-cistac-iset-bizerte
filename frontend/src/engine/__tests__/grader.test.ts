import { describe, expect, it } from "vitest";
import { FULL_CONFIG, makeDeck, mulberry32, parseCard } from "../cards";
import { GradeInput, gradeTurn, hintWasGood } from "../grader";
import { getHint } from "../hints";
import { GameState, newGame } from "../state";

const ids = (...codes: string[]) => codes.map((x) => (x.includes(".") ? x : `${x}.1`));

function input(hand: string[], extra: Partial<GradeInput> = {}): GradeInput {
  const handIds = ids(...hand);
  return {
    hand: handIds,
    table: [],
    opened: true,
    quick: false,
    unseen: makeDeck(FULL_CONFIG)
      .map((c) => c.id)
      .filter((id) => !handIds.includes(id)),
    opponentTaken: [],
    opponentOpened: false,
    ...extra,
  };
}

describe("turn grader", () => {
  const position = input(["7S", "7H", "7D", "4H", "5H", "6H", "JC", "QC", "KC", "2D"]);

  it("gives the obvious discard a quality near 1", () => {
    const g = gradeTurn(position, "2D.1");
    expect(g.quality).toBeGreaterThanOrEqual(0.9);
    expect(g.best_discard).toBe("2D.1");
    expect(g.turns_to_out_best).toBeLessThan(g.turns_to_out_played + 0.001);
  });

  it("gives a discard that breaks a meld a low quality", () => {
    expect(gradeTurn(position, "5H.1").quality).toBeLessThanOrEqual(0.3);
  });

  it("prefers keeping a near-meld over an isolated high card", () => {
    const p = input(["7S", "7H", "7D", "4H", "5H", "6H", "9C", "TC", "KD", "2S"]);
    expect(gradeTurn(p, "KD.1").quality).toBeGreaterThan(gradeTurn(p, "9C.1").quality);
  });

  it("judges a hint by its distance to the best discard", () => {
    const g = gradeTurn(position, "2D.1");
    expect(hintWasGood("2D.1", g)).toBe(true);
    expect(hintWasGood("5H.1", g)).toBe(false);
  });
});

describe("hints", () => {
  it("returns a Hint in the contract shape", () => {
    const s: GameState = newGame(5, FULL_CONFIG);
    const hint = getHint(s, 0, mulberry32(3));
    expect(["discard", "lay_down"]).toContain(hint.action);
    expect(hint.confidence).toBeGreaterThanOrEqual(0);
    expect(hint.confidence).toBeLessThanOrEqual(1);
    expect(hint.reason_codes.length).toBeGreaterThan(0);
    expect(typeof hint.hint_id).toBe("string");
  });

  it("suggests the isolated card in a clear position", () => {
    const base = newGame(1, FULL_CONFIG);
    const hand = ids("7S", "7H", "7D", "4H", "5H", "6H", "JC", "QC", "KC", "2D").map(parseCard);
    const s: GameState = { ...base, hands: [hand, base.hands[1]], opened: [true, false], phase: "play", current: 0 };
    const hint = getHint(s, 0, mulberry32(3));
    expect(hint.action).toBe("lay_down");
  });
});

import { describe, expect, it } from "vitest";
import { parseCard } from "../cards";
import {
  canLayOff,
  findMelds,
  isNearMeld,
  isValidRun,
  isValidSet,
  jokerStandsFor,
  meldValue,
  meldsContaining,
  orderMeld,
} from "../melds";

const c = (...ids: string[]) => ids.map((id) => parseCard(id.includes(".") ? id : `${id}.1`));

describe("sets", () => {
  it("accepts 3 or 4 cards of one rank in different suits", () => {
    expect(isValidSet(c("7S", "7H", "7D"))).toBe(true);
    expect(isValidSet(c("7S", "7H", "7D", "7C"))).toBe(true);
  });
  it("rejects repeated suits, mixed ranks and wrong sizes", () => {
    expect(isValidSet(c("9C.1", "9H", "9C.2"))).toBe(false);
    expect(isValidSet(c("7S", "7H", "8D"))).toBe(false);
    expect(isValidSet(c("7S", "7H"))).toBe(false);
    expect(isValidSet(c("7S", "7H", "7D", "7C", "JK.1"))).toBe(false);
  });
  it("allows one joker", () => {
    expect(isValidSet(c("7S", "7H", "JK.1"))).toBe(true);
    expect(isValidSet(c("7S", "JK.1", "JK.2"))).toBe(false);
  });
});

describe("runs", () => {
  it("accepts same-suit sequences", () => {
    expect(isValidRun(c("4H", "5H", "6H"))).toBe(true);
    expect(isValidRun(c("6H", "4H", "5H", "7H"))).toBe(true);
  });
  it("handles the ace low and high, without wrapping", () => {
    expect(isValidRun(c("AC", "2C", "3C"))).toBe(true);
    expect(isValidRun(c("QD", "KD", "AD"))).toBe(true);
    expect(isValidRun(c("KS", "AS", "2S"))).toBe(false);
  });
  it("rejects mixed suits, gaps and repeats", () => {
    expect(isValidRun(c("4H", "5S", "6H"))).toBe(false);
    expect(isValidRun(c("4H", "6H", "7H"))).toBe(false);
    expect(isValidRun(c("4H", "4H.2", "5H"))).toBe(false);
  });
  it("lets one joker fill a gap or extend the run", () => {
    expect(isValidRun(c("4H", "JK.1", "6H"))).toBe(true);
    expect(isValidRun(c("4H", "5H", "JK.1"))).toBe(true);
    expect(isValidRun(c("4H", "JK.1", "JK.2", "7H"))).toBe(false);
    expect(orderMeld(c("6H", "JK.1", "4H")).map((x) => x.id)).toEqual(["4H.1", "JK.1", "6H.1"]);
  });
});

describe("meld values", () => {
  it("counts face values, ten for faces, 11 or 1 for the ace", () => {
    expect(meldValue(c("QS", "KS", "AS"))).toBe(31);
    expect(meldValue(c("AC", "2C", "3C"))).toBe(6);
    expect(meldValue(c("TH", "TD", "TC", "TS"))).toBe(40);
    expect(meldValue(c("AS", "AH", "AD"))).toBe(33);
  });
  it("values a joker as the card it replaces", () => {
    expect(meldValue(c("9S", "JK.1", "JS"))).toBe(29);
    expect(meldValue(c("KS", "KH", "JK.1"))).toBe(30);
  });
});

describe("lay-offs and jokers", () => {
  it("adds cards to sets and both ends of runs", () => {
    expect(canLayOff(parseCard("8H.1"), c("5H", "6H", "7H"))).toBe(true);
    expect(canLayOff(parseCard("4H.1"), c("5H", "6H", "7H"))).toBe(true);
    expect(canLayOff(parseCard("9H.1"), c("5H", "6H", "7H"))).toBe(false);
    expect(canLayOff(parseCard("7C.1"), c("7S", "7H", "7D"))).toBe(true);
    expect(canLayOff(parseCard("7C.1"), c("7S", "7H", "7D", "7C.2"))).toBe(false);
  });
  it("knows which card a joker stands for", () => {
    expect(jokerStandsFor(c("3C", "JK.1", "5C"))).toEqual(["4C"]);
    expect(jokerStandsFor(c("KS", "KH", "JK.1")).sort()).toEqual(["KC", "KD"]);
    expect(jokerStandsFor(c("3C", "4C", "5C"))).toEqual([]);
  });
});

describe("findMelds", () => {
  it("finds the partition with the least deadwood", () => {
    const hand = c("7S", "4H", "KC", "7H", "QC", "5H", "7D", "6H", "JC", "2S");
    const best = findMelds(hand);
    expect(best.melds).toHaveLength(3);
    expect(best.deadwood.map((x) => x.id)).toEqual(["2S.1"]);
  });
  it("shares a card between a set and a run correctly", () => {
    // 5H can go in 5S-5H-5D or in 3H-4H-5H; the best split uses both melds.
    const best = findMelds(c("5S", "5H", "5D", "5C", "3H", "4H"));
    expect(best.deadwood).toHaveLength(0);
    expect(best.melds).toHaveLength(2);
  });
  it("uses jokers and two decks", () => {
    const best = findMelds(c("9C.1", "9C.2", "TC", "JC", "QC.1", "JK.1", "9H"));
    expect(best.deadwood.length).toBeLessThanOrEqual(1);
  });
  it("maximises points in opening mode", () => {
    const hand = c("QS", "KS", "AS", "TH", "TD", "TC", "TS");
    const opening = findMelds(hand, "opening");
    expect(opening.meldPoints).toBe(71);
  });
  it("lists melds containing a given card", () => {
    const hand = c("7S", "7H", "5D", "6D");
    expect(meldsContaining(hand, parseCard("7D.1")).length).toBeGreaterThan(0);
    expect(meldsContaining(hand, parseCard("KC.1"))).toHaveLength(0);
  });
  it("spots near-melds", () => {
    const hand = c("7S", "8S", "KD");
    expect(isNearMeld(hand[0], hand)).toBe(true);
    expect(isNearMeld(hand[2], hand)).toBe(false);
  });
  it("is fast enough for search", () => {
    const hand = c("AS", "2S", "3S", "4S", "7H", "7D", "7C", "9C", "TC", "JC", "QD", "KD", "5H", "JK.1", "8S");
    const start = performance.now();
    for (let i = 0; i < 200; i++) findMelds(hand);
    const perCall = (performance.now() - start) / 200;
    expect(perCall).toBeLessThan(5);
  });
});

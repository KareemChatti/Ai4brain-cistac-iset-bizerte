// Melds: validity, layout, value, and the best way to split a hand into melds.
//   set = 3-4 cards of one rank, all different suits
//   run = 3+ consecutive cards of one suit; ace low (A-2-3) or high (Q-K-A), no wrap (K-A-2)
//   at most one joker per meld

import { Card, SUITS, Suit, meldRankPoints, penaltyPoints, rankFromValue, rankValue } from "./cards";

export type MeldKind = "set" | "run";

/** One position in a laid-out meld. For runs `value` is 1..14 (14 = high ace). */
export type Slot = { card: Card; value: number };

export function setLayout(cards: Card[]): Slot[] | null {
  if (cards.length < 3 || cards.length > 4) return null;
  const jokers = cards.filter((c) => c.joker);
  const reals = cards.filter((c) => !c.joker);
  if (jokers.length > 1 || reals.length < 2) return null;
  const rank = reals[0].rank!;
  if (reals.some((c) => c.rank !== rank)) return null;
  if (new Set(reals.map((c) => c.suit)).size !== reals.length) return null;
  const value = rankValue(rank) === 1 ? 14 : rankValue(rank); // an ace in a set counts 11
  return cards.map((card) => ({ card, value }));
}

export function runLayout(cards: Card[]): Slot[] | null {
  if (cards.length < 3 || cards.length > 13) return null;
  const jokers = cards.filter((c) => c.joker);
  const reals = cards.filter((c) => !c.joker);
  if (jokers.length > 1 || reals.length < 2) return null;
  const suit = reals[0].suit;
  if (reals.some((c) => c.suit !== suit)) return null;

  const aces = reals.filter((c) => c.rank === "A").length;
  if (aces > 1) return null;
  const options = aces ? [1, 14] : [0];
  for (const aceValue of options) {
    const slots: Slot[] = reals.map((card) => ({ card, value: card.rank === "A" ? aceValue : rankValue(card.rank!) }));
    slots.sort((a, b) => a.value - b.value);
    const values = slots.map((s) => s.value);
    if (new Set(values).size !== values.length) continue;
    const min = values[0];
    const max = values[values.length - 1];
    const missing = max - min + 1 - values.length;
    if (missing > jokers.length) continue;
    if (jokers.length === 1) {
      let jokerValue: number;
      if (missing === 1) {
        jokerValue = values.find((v, i) => values[i + 1] !== undefined && values[i + 1] !== v + 1)! + 1;
      } else if (max < 14 && max - min < 12) {
        jokerValue = max + 1; // extend at the top: worth more for opening
      } else if (min > 1) {
        jokerValue = min - 1;
      } else continue;
      slots.push({ card: jokers[0], value: jokerValue });
      slots.sort((a, b) => a.value - b.value);
    }
    return slots;
  }
  return null;
}

export function meldKind(cards: Card[]): MeldKind | null {
  if (setLayout(cards)) return "set";
  if (runLayout(cards)) return "run";
  return null;
}

export const isValidSet = (cards: Card[]) => setLayout(cards) !== null;
export const isValidRun = (cards: Card[]) => runLayout(cards) !== null;
export const isValidMeld = (cards: Card[]) => meldKind(cards) !== null;

export function layout(cards: Card[]): Slot[] | null {
  return setLayout(cards) ?? runLayout(cards);
}

/** Points of a meld for the opening: numbers face value, J/Q/K 10, ace 11 (1 in A-2-3), joker = card it replaces. */
export function meldValue(cards: Card[]): number {
  const slots = layout(cards);
  if (!slots) return 0;
  return slots.reduce((sum, s) => sum + meldRankPoints(s.value), 0);
}

/** Cards of a meld in display order (runs sorted, joker in its place). */
export function orderMeld(cards: Card[]): Card[] {
  return layout(cards)?.map((s) => s.card) ?? cards;
}

/** Which real cards could replace the joker of a table meld ("TS" style codes). */
export function jokerStandsFor(cards: Card[]): string[] {
  const set = setLayout(cards);
  if (set) {
    if (!cards.some((c) => c.joker)) return [];
    const reals = cards.filter((c) => !c.joker);
    const rank = reals[0].rank!;
    return SUITS.filter((s) => !reals.some((c) => c.suit === s)).map((s) => `${rank}${s}`);
  }
  const run = runLayout(cards);
  if (!run) return [];
  const slot = run.find((s) => s.card.joker);
  if (!slot) return [];
  const suit = run.find((s) => !s.card.joker)!.card.suit as Suit;
  return [`${rankFromValue(slot.value)}${suit}`];
}

export function canLayOff(card: Card, meld: Card[]): boolean {
  const kind = meldKind(meld);
  if (!kind) return false;
  const combined = [...meld, card];
  return kind === "set" ? isValidSet(combined) : isValidRun(combined);
}

// ---------------------------------------------------------------------------
// Best partition of a hand into melds (backtracking over bitmasks, memoised).

export type Partition = {
  melds: Card[][];
  deadwood: Card[];
  deadwoodPoints: number; // penalty value of the cards left over
  meldPoints: number; // opening value of the melds
};

type Candidate = { mask: number; points: number };

/** Every valid meld that can be built from `cards`, as bitmasks over the array. */
function candidateMelds(cards: Card[]): Candidate[] {
  const jokers: number[] = [];
  const byRank = new Map<number, Map<Suit, number[]>>();
  const bySuit = new Map<Suit, Map<number, number[]>>();
  cards.forEach((card, i) => {
    if (card.joker) return jokers.push(i);
    const r = rankValue(card.rank!);
    const suit = card.suit!;
    if (!byRank.has(r)) byRank.set(r, new Map());
    const rankSuits = byRank.get(r)!;
    rankSuits.set(suit, [...(rankSuits.get(suit) ?? []), i]);
    if (!bySuit.has(suit)) bySuit.set(suit, new Map());
    const suitRanks = bySuit.get(suit)!;
    for (const v of r === 1 ? [1, 14] : [r]) suitRanks.set(v, [...(suitRanks.get(v) ?? []), i]);
  });

  const masks = new Set<number>();
  const add = (indices: number[]) => {
    let mask = 0;
    for (const i of indices) mask |= 1 << i;
    masks.add(mask);
  };
  // Cartesian product of copy choices (two decks: the same card may exist twice).
  const product = (groups: number[][]): number[][] =>
    groups.reduce<number[][]>((acc, group) => acc.flatMap((combo) => group.map((i) => [...combo, i])), [[]]);

  for (const suitMap of byRank.values()) {
    const suits = [...suitMap.keys()];
    for (let pick = 1; pick < 1 << suits.length; pick++) {
      const chosen = suits.filter((_, k) => pick & (1 << k));
      if (chosen.length < 2) continue;
      for (const combo of product(chosen.map((s) => suitMap.get(s)!))) {
        if (combo.length >= 3) add(combo);
        if (combo.length <= 3) for (const j of jokers) add([...combo, j]);
      }
    }
  }

  for (const valueMap of bySuit.values()) {
    for (let lo = 1; lo <= 12; lo++) {
      for (let hi = lo + 2; hi <= Math.min(lo + 12, 14); hi++) {
        const groups: number[][] = [];
        let missing = 0;
        for (let v = lo; v <= hi; v++) {
          const found = valueMap.get(v);
          if (found) groups.push(found);
          else missing++;
        }
        if (missing > (jokers.length ? 1 : 0)) break;
        if (groups.length < 2) continue;
        for (const combo of product(groups)) {
          if (missing === 0) add(combo);
          else for (const j of jokers) add([...combo, j]);
        }
      }
    }
  }

  const result: Candidate[] = [];
  for (const mask of masks) {
    const meld = cards.filter((_, i) => mask & (1 << i));
    if (isValidMeld(meld)) result.push({ mask, points: meldValue(meld) });
  }
  return result;
}

/**
 * Split `hand` into melds. Mode "deadwood" minimises the penalty points left over
 * (then the number of cards left); mode "opening" maximises the meld points.
 */
export function findMelds(hand: Card[], mode: "deadwood" | "opening" = "deadwood"): Partition {
  // Jokers last, so the lowest unused card of any state is a real card while one remains.
  const cards = [...hand.filter((c) => !c.joker), ...hand.filter((c) => c.joker)];
  const n = cards.length;
  const candidates = candidateMelds(cards);
  const byLowest: Candidate[][] = cards.map(() => []);
  for (const c of candidates) byLowest[31 - Math.clz32(c.mask & -c.mask)].push(c);

  const skipCost = (i: number) =>
    mode === "deadwood" ? penaltyPoints(cards[i]) * 100 + 1 : penaltyPoints(cards[i]) * 0.001;
  const meldCost = (c: Candidate) => (mode === "deadwood" ? -c.points * 0.0001 : -c.points);

  const memo = new Map<number, [number, number]>(); // mask -> [cost, chosen meld mask or -1]
  const solve = (mask: number): number => {
    if (mask === 0) return 0;
    const hit = memo.get(mask);
    if (hit) return hit[0];
    const first = 31 - Math.clz32(mask & -mask);
    let best = skipCost(first) + solve(mask & ~(1 << first));
    let choice = -1;
    for (const c of byLowest[first]) {
      if ((c.mask & mask) !== c.mask) continue;
      const cost = meldCost(c) + solve(mask & ~c.mask);
      if (cost < best) {
        best = cost;
        choice = c.mask;
      }
    }
    memo.set(mask, [best, choice]);
    return best;
  };

  const full = n >= 31 ? 0 : (1 << n) - 1;
  solve(full);

  const melds: Card[][] = [];
  const deadwood: Card[] = [];
  let mask = full;
  while (mask) {
    const first = 31 - Math.clz32(mask & -mask);
    const choice = memo.get(mask)?.[1] ?? -1;
    if (choice === -1) {
      deadwood.push(cards[first]);
      mask &= ~(1 << first);
    } else {
      melds.push(orderMeld(cards.filter((_, i) => choice & (1 << i))));
      mask &= ~choice;
    }
  }
  return {
    melds,
    deadwood,
    deadwoodPoints: deadwood.reduce((s, c) => s + penaltyPoints(c), 0),
    meldPoints: melds.reduce((s, m) => s + meldValue(m), 0),
  };
}

/** Every meld from `hand` that contains `card` (used to check a taken discard can be played). */
export function meldsContaining(hand: Card[], card: Card): Card[][] {
  const cards = [card, ...hand.filter((c) => c.id !== card.id)];
  return candidateMelds(cards)
    .filter((c) => c.mask & 1)
    .map((c) => orderMeld(cards.filter((_, i) => c.mask & (1 << i))));
}

/** A card that is one card away from a meld: a pair of the same rank, or same suit within two ranks. */
export function isNearMeld(card: Card, hand: Card[]): boolean {
  if (card.joker) return true;
  return hand.some((other) => {
    if (other.id === card.id || other.joker) return false;
    if (other.rank === card.rank && other.suit !== card.suit) return true;
    if (other.suit !== card.suit) return false;
    const a = rankValue(card.rank!);
    const b = rankValue(other.rank!);
    const diff = Math.min(Math.abs(a - b), Math.abs((a === 1 ? 14 : a) - (b === 1 ? 14 : b)));
    return diff >= 1 && diff <= 2;
  });
}

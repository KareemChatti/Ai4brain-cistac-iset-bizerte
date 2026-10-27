// Puzzle generators for the mini-games. Pure functions of (level, rng), so they can be tested.

import { Card, FULL_CONFIG, RANKS, SUITS, makeDeck, parseCard, rankValue, shortId, shuffle } from "../engine/cards";
import { canLayOff, isValidMeld } from "../engine/melds";
import { GradeInput, gradeTurn } from "../engine/grader";

type Rng = () => number;
const pick = <T,>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const oneDeck = () => makeDeck({ ...FULL_CONFIG, decks: 1, jokers: 0 });
const ids = (cards: Card[]) => cards.map((c) => c.id);

// ---------- card_recall ----------
/** `length` different cards to memorise, in order. */
export function recallSequence(length: number, rng: Rng): string[] {
  return ids(shuffle(oneDeck(), rng).slice(0, length));
}

// ---------- meld_spotter ----------
function randomMeld(rng: Rng): Card[] {
  const deck = oneDeck();
  if (rng() < 0.5) {
    const rank = pick(RANKS, rng);
    return shuffle(deck.filter((c) => c.rank === rank), rng).slice(0, 3);
  }
  const suit = pick(SUITS, rng);
  const start = 1 + Math.floor(rng() * 11); // 1..11, so start+2 <= 13
  return deck.filter((c) => c.suit === suit && rankValue(c.rank!) >= start && rankValue(c.rank!) < start + 3);
}

/** Would adding `card` to `chosen` create a valid 3-card meld? */
function completesMeld(card: Card, chosen: Card[]): boolean {
  for (let a = 0; a < chosen.length; a++)
    for (let b = a + 1; b < chosen.length; b++) if (isValidMeld([chosen[a], chosen[b], card])) return true;
  return false;
}

/** 12 cards hiding exactly one valid 3-card meld. Higher levels add more near-miss decoys. */
export function meldSpotterHand(level: number, rng: Rng): { cards: string[]; meld: string[] } {
  const meld = randomMeld(rng);
  const meldIds = new Set(ids(meld));
  const rest = shuffle(oneDeck().filter((c) => !meldIds.has(c.id)), rng);
  // Near misses first (sharing a rank, or a suit-neighbour, with the meld), more of them at higher levels.
  const isNear = (c: Card) =>
    meld.some((m) => c.rank === m.rank || (c.suit === m.suit && Math.abs(rankValue(c.rank!) - rankValue(m.rank!)) <= 2));
  const nearWanted = Math.min(6, level);
  const ordered = [...rest.filter(isNear).slice(0, nearWanted * 2), ...rest.filter((c) => !isNear(c))];
  const chosen: Card[] = [...meld];
  let near = 0;
  for (const card of ordered) {
    if (chosen.length === 12) break;
    if (isNear(card) && near >= nearWanted) continue;
    // Never create a second meld (with the meld's cards or with other decoys).
    if (completesMeld(card, chosen)) continue;
    chosen.push(card);
    if (isNear(card)) near++;
  }
  return { cards: ids(shuffle(chosen, rng)), meld: ids(meld) };
}

/** Seconds allowed per meld_spotter hand: 10 s at level 1 down to 4 s at level 8. */
export const spotterSeconds = (level: number) => Math.max(4, 10 - (level - 1) * 0.85);

// ---------- quick_match ----------
/** A meld on the table and one card: does the card fit? About half do. */
export function quickMatchTrial(level: number, rng: Rng): { meld: string[]; card: string; fits: boolean } {
  const meld = randomMeld(rng);
  const pool = oneDeck().filter((c) => !meld.some((m) => m.id === c.id));
  const fitting = pool.filter((c) => canLayOff(c, meld));
  const wantFit = rng() < 0.5 && fitting.length > 0;
  let card: Card;
  if (wantFit) card = pick(fitting, rng);
  else {
    const wrong = pool.filter((c) => !canLayOff(c, meld));
    // Harder levels pick wrong cards that look right: same rank or same suit nearby.
    const lookalike = wrong.filter((c) =>
      meld.some((m) => c.rank === m.rank || (c.suit === m.suit && Math.abs(rankValue(c.rank!) - rankValue(m.rank!)) <= 2)),
    );
    card = lookalike.length && rng() < Math.min(0.9, level / 8) ? pick(lookalike, rng) : pick(wrong, rng);
  }
  return { meld: ids(meld), card: card.id, fits: canLayOff(card, meld) };
}

// ---------- rami_puzzle ----------
/** A hand where one discard is clearly best (graded by the same grader as real rounds). */
export function puzzlePosition(level: number, rng: Rng): { hand: string[]; best: string; scores: Record<string, number> } {
  const size = 6 + Math.min(level, 7); // 7 .. 13 cards
  let fallback: { hand: string[]; best: string; scores: Record<string, number> } | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const deck = makeDeck({ ...FULL_CONFIG, decks: 1, jokers: level >= 5 ? 1 : 0 });
    const hand = shuffle(deck, rng).slice(0, size);
    const handIds = ids(hand);
    const input: GradeInput = {
      hand: handIds,
      table: [],
      opened: true,
      quick: true,
      unseen: ids(deck.filter((c) => !handIds.includes(c.id))),
      opponentTaken: [],
      opponentOpened: false,
    };
    const grade = gradeTurn(input, handIds[0]);
    const sorted = Object.values(grade.scores).sort((a, b) => a - b);
    const position = { hand: handIds, best: grade.best_discard, scores: grade.scores };
    fallback ??= position;
    // Clear answer: the best is ahead of the runner-up; traps (close runners-up) grow with level.
    const margin = Math.max(0.05, 0.4 - level * 0.04);
    if (sorted.length > 1 && sorted[1] - sorted[0] >= margin) return position;
  }
  return fallback!;
}

export const isBestDiscard = (chosen: string, position: { scores: Record<string, number> }) => {
  const best = Math.min(...Object.values(position.scores));
  return (position.scores[shortId(chosen)] ?? Infinity) - best <= 0.02;
};

// ---------- rule_switch ----------
export type SortRule = "colour" | "rank" | "neighbour" | "suit";

export const RULES_BY_LEVEL = (level: number): SortRule[] =>
  level <= 2 ? ["colour", "rank"] : level <= 4 ? ["colour", "rank", "neighbour"] : ["colour", "rank", "neighbour", "suit"];

const red = (c: Card) => c.suit === "H" || c.suit === "D";

export function fitsRule(rule: SortRule, reference: string, card: string): boolean {
  const a = parseCard(reference);
  const b = parseCard(card);
  switch (rule) {
    case "colour":
      return red(a) === red(b);
    case "rank":
      return a.rank === b.rank;
    case "suit":
      return a.suit === b.suit;
    case "neighbour":
      return a.suit === b.suit && Math.abs(rankValue(a.rank!) - rankValue(b.rank!)) === 1;
  }
}

/** A reference card and a card to sort; about half fit the hidden rule. */
export function ruleSwitchTrial(rule: SortRule, rng: Rng): { reference: string; card: string; fits: boolean } {
  const deck = oneDeck();
  const reference = pick(deck, rng);
  const others = deck.filter((c) => c.id !== reference.id);
  const fitting = others.filter((c) => fitsRule(rule, reference.id, c.id));
  const notFitting = others.filter((c) => !fitsRule(rule, reference.id, c.id));
  const card = rng() < 0.5 && fitting.length ? pick(fitting, rng) : pick(notFitting, rng);
  return { reference: reference.id, card: card.id, fits: fitsRule(rule, reference.id, card.id) };
}

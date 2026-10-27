// Position evaluation shared by the AI, the grader and the hints.

import { Card, GameConfig, makeDeck, shortId } from "./cards";
import { canLayOff, findMelds } from "./melds";
import { GameState, Player } from "./state";

/** What a player can see when deciding: their hand, the table, the known cards. */
export type View = {
  hand: Card[];
  table: Card[][];
  opened: boolean;
  config: GameConfig;
  /** Cards the player has not seen: the possible next draws. */
  unseen: Card[];
  /** Cards the opponent took from the discard pile. */
  opponentTaken: Card[];
  opponentOpened: boolean;
};

export function viewOf(state: GameState, player: Player): View {
  const seen = new Set<string>([
    ...state.hands[player].map((c) => c.id),
    ...state.table.flatMap((m) => m.cards.map((c) => c.id)),
    ...state.discard.map((c) => c.id),
    ...state.taken[player === 0 ? 1 : 0].map((c) => c.id),
  ]);
  return {
    hand: state.hands[player],
    table: state.table.map((m) => m.cards),
    opened: state.opened[player],
    config: state.config,
    unseen: makeDeck(state.config).filter((c) => !seen.has(c.id)),
    opponentTaken: state.taken[player === 0 ? 1 : 0],
    opponentOpened: state.opened[player === 0 ? 1 : 0],
  };
}

const handKey = (hand: Card[]) =>
  hand
    .map((c) => shortId(c.id))
    .sort()
    .join(",");

/** Memoised distance evaluation (positions repeat a lot during search). */
export class Evaluator {
  private cache = new Map<string, number>();
  constructor(
    private table: Card[][],
    private opened: boolean,
    private config: GameConfig,
  ) {}

  /**
   * Cards not covered by the best melds (minus those that can be laid off once
   * opened), plus 3 if the player has not opened and cannot reach the opening yet.
   */
  distance(hand: Card[]): number {
    const key = handKey(hand);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const best = findMelds(hand);
    let left = best.deadwood.filter((c) => !(this.opened && this.table.some((m) => canLayOff(c, m)))).length;
    if (!this.opened && findMelds(hand, "opening").meldPoints < this.config.openingMin) left += 3;
    this.cache.set(key, left);
    return left;
  }
}

export function distanceToOut(hand: Card[], table: Card[][], opened: boolean, config: GameConfig): number {
  return new Evaluator(table, opened, config).distance(hand);
}

/** The unseen cards grouped by face (two decks: the same face can appear twice), with weights. */
export function drawDistribution(unseen: Card[]): { card: Card; weight: number }[] {
  const groups = new Map<string, { card: Card; weight: number }>();
  for (const card of unseen) {
    const key = shortId(card.id);
    const g = groups.get(key);
    if (g) g.weight += 1;
    else groups.set(key, { card, weight: 1 });
  }
  return [...groups.values()];
}

/** Distinct discard candidates (one per face), never a joker while something else is possible. */
export function discardCandidates(hand: Card[], mustUse: string[] = []): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const card of hand) {
    if (mustUse.includes(card.id)) continue;
    const key = shortId(card.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  const real = out.filter((c) => !c.joker);
  return real.length ? real : out;
}

/**
 * Expected distance to going out after discarding `discard` and drawing the next
 * card, averaged over every unseen card. This is our "turns to go out" estimate:
 * each turn can place at most about one more card.
 */
export function expectedDistance(view: View, discard: Card, evaluator: Evaluator, draws = drawDistribution(view.unseen)): number {
  const rest = view.hand.filter((c) => c.id !== discard.id);
  if (!draws.length) return evaluator.distance(rest);
  let total = 0;
  let weight = 0;
  for (const { card, weight: w } of draws) {
    total += w * evaluator.distance([...rest, card]);
    weight += w;
  }
  return total / weight;
}

/** Would discarding this card help the opponent? (it fits cards they collected, or a table meld) */
export function isDangerous(card: Card, view: View): boolean {
  if (card.joker) return true;
  if (view.opponentOpened && view.table.some((m) => canLayOff(card, m))) return true;
  return view.opponentTaken.some((t) => {
    if (t.joker) return false;
    if (t.rank === card.rank && t.suit !== card.suit) return true;
    if (t.suit !== card.suit) return false;
    const diff = Math.abs("A23456789TJQK".indexOf(t.rank!) - "A23456789TJQK".indexOf(card.rank!));
    return diff >= 1 && diff <= 2;
  });
}

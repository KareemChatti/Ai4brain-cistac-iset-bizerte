import { Card, penaltyPoints, shuffle } from "./cards";
import { Evaluator, View, discardCandidates, drawDistribution, expectedDistance, isDangerous, viewOf } from "./eval";
import { canLayOff, findMelds, isNearMeld, jokerStandsFor, meldsContaining } from "./melds";
import { Action, applyAction, canUseCard, legalActions } from "./rules";
import { GameState, topDiscard } from "./state";

export type Level = 1 | 2 | 3 | 4 | 5;
type Rng = () => number;

export function chooseAction(state: GameState, level: Level, rng: Rng): Action {
  return state.phase === "draw" ? chooseDraw(state, level) : choosePlay(state, level, rng);
}

function chooseDraw(state: GameState, level: Level): Action {
  const p = state.current;
  const top = topDiscard(state);
  if (level >= 2 && top && canUseCard(state, p, top)) {
    const view = viewOf(state, p);
    const ev = new Evaluator(view.table, view.opened, view.config);
    if (ev.distance([...view.hand, top]) < ev.distance(view.hand)) return { type: "drawDiscard" };
  }
  return { type: "drawStock" };
}

function choosePlay(state: GameState, level: Level, rng: Rng): Action {
  const p = state.current;
  const hand = state.hands[p];
  const opened = state.opened[p];

  const best = findMelds(hand, opened ? "deadwood" : "opening");
  if (best.melds.length && (opened || best.meldPoints >= state.config.openingMin)) {
    const action: Action = { type: "layDown", melds: best.melds.map((m) => m.map((c) => c.id)) };
    if (tryAction(state, action)) return action;
  }

  for (const id of state.mustUse) {
    const card = hand.find((c) => c.id === id);
    if (!card) continue;
    const meld = meldsContaining(hand, card)[0];
    if (meld && (opened || meldPointsOk(state, hand, meld))) {
      const action: Action = { type: "layDown", melds: [meld.map((c) => c.id)] };
      if (tryAction(state, action)) return action;
    }
    const target = state.table.find((m) => canLayOff(card, m.cards));
    if (target && opened) return { type: "layOff", cardId: card.id, meldId: target.id };
  }

  if (opened) {
    for (const card of hand) {
      if (hand.length === 1 && level >= 2) break;
      const target = state.table.find((m) => canLayOff(card, m.cards));
      if (target) {
        const action: Action = { type: "layOff", cardId: card.id, meldId: target.id };
        if (tryAction(state, action)) return action;
      }
    }
    if (level >= 3) {
      for (const meld of state.table) {
        if (!meld.cards.some((c) => c.joker)) continue;
        const wanted = jokerStandsFor(meld.cards);
        const card = hand.find((c) => !c.joker && wanted.includes(`${c.rank}${c.suit}`));
        if (!card) continue;
        const action: Action = { type: "swapJoker", cardId: card.id, meldId: meld.id };
        if (tryAction(state, action)) return action;
      }
    }
  }

  return { type: "discard", cardId: chooseDiscard(state, level, rng).id };
}

function meldPointsOk(state: GameState, hand: Card[], meld: Card[]): boolean {
  const rest = hand.filter((c) => !meld.includes(c));
  const total = findMelds(meld, "opening").meldPoints + findMelds(rest, "opening").meldPoints;
  return total >= state.config.openingMin;
}

function tryAction(state: GameState, action: Action): boolean {
  try {
    applyAction(state, action);
    return true;
  } catch {
    return false;
  }
}

function greedyScore(card: Card, hand: Card[], meldIds: Set<string>): number {
  if (card.joker) return 1000;
  if (meldIds.has(card.id)) return 500;
  if (isNearMeld(card, hand)) return 100 - penaltyPoints(card);
  return -penaltyPoints(card);
}

export function greedyDiscard(hand: Card[], mustUse: string[] = []): Card {
  const meldIds = new Set(findMelds(hand).melds.flat().map((c) => c.id));
  const candidates = discardCandidates(hand, mustUse);
  return candidates.reduce((best, card) =>
    greedyScore(card, hand, meldIds) < greedyScore(best, hand, meldIds) ? card : best,
  );
}

export function chooseDiscard(state: GameState, level: Level, rng: Rng): Card {
  const p = state.current;
  const hand = state.hands[p];
  const candidates = discardCandidates(hand, state.mustUse);
  if (level === 1) return candidates[Math.floor(rng() * candidates.length)];
  if (level === 2) return greedyDiscard(hand, state.mustUse);

  const view = viewOf(state, p);
  if (level === 3) {
    const meldIds = new Set(findMelds(hand).melds.flat().map((c) => c.id));
    return candidates.reduce((best, card) => {
      const score = (c: Card) => greedyScore(c, hand, meldIds) + (isDangerous(c, view) ? 60 : 0);
      return score(card) < score(best) ? card : best;
    });
  }

  const ranked = rankByLookahead(view, candidates);
  if (level === 4 || ranked.length === 1) return ranked[0].card;
  return monteCarlo(view, ranked.slice(0, 4), rng);
}

export function rankByLookahead(view: View, candidates: Card[]): { card: Card; score: number }[] {
  const ev = new Evaluator(view.table, view.opened, view.config);
  const draws = drawDistribution(view.unseen);
  return candidates
    .map((card) => ({ card, score: expectedDistance(view, card, ev, draws) + (isDangerous(card, view) ? 0.35 : 0) }))
    .sort((a, b) => a.score - b.score || penaltyPoints(b.card) - penaltyPoints(a.card));
}

function monteCarlo(view: View, ranked: { card: Card; score: number }[], rng: Rng, samples = 24, horizon = 8): Card {
  const ev = new Evaluator(view.table, view.opened, view.config);
  let best = ranked[0];
  let bestTurns = Infinity;
  for (const option of ranked) {
    let total = 0;
    for (let s = 0; s < samples; s++) {
      const stock = shuffle(view.unseen, rng);
      let hand = view.hand.filter((c) => c.id !== option.card.id);
      let turns = horizon + 1;
      for (let t = 1; t <= horizon && stock.length; t++) {
        hand = [...hand, stock.pop()!];
        if (ev.distance(hand) <= 1) {
          turns = t;
          break;
        }
        const drop = greedyDiscard(hand);
        hand = hand.filter((c) => c.id !== drop.id);
      }
      total += turns;
    }
    const mean = total / samples + option.score * 0.01;
    if (mean < bestTurns) {
      bestTurns = mean;
      best = option;
    }
  }
  return best.card;
}

export function playTurn(state: GameState, level: Level, rng: Rng): { state: GameState; actions: Action[] } {
  const player = state.current;
  const actions: Action[] = [];
  let s = state;
  for (let guard = 0; guard < 40 && s.phase !== "over" && s.current === player; guard++) {
    let action = chooseAction(s, level, rng);
    try {
      s = applyAction(s, action);
    } catch {
      const legal = legalActions(s);
      action =
        legal.find((a) => a.type === "layDown" || a.type === "layOff") ??
        legal.find((a) => a.type === "discard" && a.cardId === greedyDiscard(s.hands[player], s.mustUse).id) ??
        legal[legal.length - 1];
      s = applyAction(s, action);
    }
    actions.push(action);
    if (action.type === "discard") break;
  }
  return { state: s, actions };
}

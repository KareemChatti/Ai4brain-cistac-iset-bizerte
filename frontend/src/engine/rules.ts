// Turn rules. applyAction never mutates its input: it returns a new state or throws RuleError.

import { Card, mulberry32, penaltyPoints, shortId, shuffle } from "./cards";
import { canLayOff, findMelds, jokerStandsFor, meldKind, meldValue, meldsContaining, orderMeld } from "./melds";
import { GameState, Player, cloneState, other, topDiscard } from "./state";

export type Action =
  | { type: "drawStock" }
  | { type: "drawDiscard" }
  | { type: "layDown"; melds: string[][] }
  | { type: "layOff"; cardId: string; meldId: number }
  | { type: "swapJoker"; cardId: string; meldId: number }
  | { type: "discard"; cardId: string };

export class RuleError extends Error {}

/** Safety net: a round that somehow drags on this long ends on penalties. */
export const MAX_TURNS = 400;

const fail = (message: string): never => {
  throw new RuleError(message);
};

function takeFromHand(hand: Card[], id: string): Card {
  const i = hand.findIndex((c) => c.id === id);
  if (i < 0) fail("That card is not in your hand.");
  return hand.splice(i, 1)[0];
}

/** Could `card` be put on the table this turn if the player took it? */
export function canUseCard(state: GameState, player: Player, card: Card): boolean {
  const hand = [...state.hands[player], card];
  if (state.opened[player]) {
    if (state.table.some((m) => canLayOff(card, m.cards))) return true;
    return meldsContaining(hand, card).length > 0;
  }
  // Not opened yet: the opening lay-down must include this card and reach the minimum.
  for (const meld of meldsContaining(hand, card)) {
    const rest = hand.filter((c) => !meld.some((m) => m.id === c.id));
    if (meldValue(meld) + findMelds(rest, "opening").meldPoints >= state.config.openingMin) return true;
  }
  return false;
}

/** After a lay-down or lay-off: an empty hand ends the round, unless the house rule wants a final discard. */
function finishIfEmpty(state: GameState, player: Player): GameState {
  if (state.hands[player].length === 0) {
    if (state.config.mustDiscardToGoOut) fail("Keep one card: you go out by discarding your last card.");
    state.phase = "over";
    state.winner = player;
  }
  return state;
}

function endOnPenalties(state: GameState): GameState {
  const [a, b] = scoreRound({ ...state, winner: null });
  state.phase = "over";
  state.winner = a <= b ? 0 : 1;
  return state;
}

export function applyAction(input: GameState, action: Action): GameState {
  const state = applyRaw(input, action);
  // A taken discard or a swapped joker must stay playable until the player places it.
  if (state.phase === "play" && action.type !== "drawDiscard") {
    const p = state.current;
    for (const id of state.mustUse) {
      const card = state.hands[p].find((c) => c.id === id);
      if (!card) continue;
      const without = { ...state, hands: state.hands.map((h, i) => (i === p ? h.filter((c) => c.id !== id) : h)) as [Card[], Card[]] };
      if (!canUseCard(without, p, card)) fail(`That would leave ${shortId(id)} with nowhere to go this turn.`);
    }
  }
  return state;
}

function applyRaw(input: GameState, action: Action): GameState {
  if (input.phase === "over") fail("The round is over.");
  const state = cloneState(input);
  const p = state.current;
  const hand = state.hands[p];

  switch (action.type) {
    case "drawStock": {
      if (state.phase !== "draw") fail("You have already drawn this turn.");
      if (state.stock.length === 0) {
        const top = state.discard.pop();
        state.reshuffles += 1;
        state.stock = shuffle(state.discard, mulberry32(state.seed + state.reshuffles * 7919));
        state.discard = top ? [top] : [];
        if (state.stock.length === 0) return endOnPenalties(state);
      }
      hand.push(state.stock.pop()!);
      state.phase = "play";
      return state;
    }

    case "drawDiscard": {
      if (state.phase !== "draw") fail("You have already drawn this turn.");
      const top = topDiscard(state);
      if (!top) fail("The discard pile is empty.");
      const mustUse = state.config.discardMustBeUsed;
      if (mustUse && !canUseCard(state, p, top!)) fail("You can only take the top discard if you lay it down this turn.");
      hand.push(state.discard.pop()!);
      if (mustUse) state.mustUse.push(top!.id);
      state.taken[p].push(top!);
      state.phase = "play";
      return state;
    }

    case "layDown": {
      if (state.phase !== "play") fail("Draw a card first.");
      if (action.melds.length === 0) fail("Choose the cards of at least one meld.");
      const melds: Card[][] = [];
      const used = new Set<string>();
      for (const ids of action.melds) {
        const cards = ids.map((id) => {
          if (used.has(id)) fail("A card can only be in one meld.");
          used.add(id);
          return hand.find((c) => c.id === id) ?? fail("That card is not in your hand.");
        });
        if (!meldKind(cards)) fail(`${ids.map(shortId).join(" ")} is not a valid set or run.`);
        melds.push(cards);
      }
      if (!state.opened[p]) {
        const total = melds.reduce((s, m) => s + meldValue(m), 0);
        if (total < state.config.openingMin) {
          fail(`Your first lay-down must be worth at least ${state.config.openingMin} points (this one is ${total}).`);
        }
        state.opened[p] = true;
      }
      for (const cards of melds) {
        cards.forEach((c) => takeFromHand(hand, c.id));
        state.table.push({ id: state.nextMeldId++, owner: p, kind: meldKind(cards)!, cards: orderMeld(cards) });
      }
      state.mustUse = state.mustUse.filter((id) => !used.has(id));
      return finishIfEmpty(state, p);
    }

    case "layOff": {
      if (state.phase !== "play") fail("Draw a card first.");
      if (!state.opened[p]) fail("You can lay off only after opening.");
      const meld = state.table.find((m) => m.id === action.meldId) ?? fail("That meld is not on the table.");
      const card = hand.find((c) => c.id === action.cardId) ?? fail("That card is not in your hand.");
      if (!canLayOff(card, meld.cards)) fail(`${shortId(card.id)} does not fit that meld.`);
      takeFromHand(hand, card.id);
      meld.cards = orderMeld([...meld.cards, card]);
      state.mustUse = state.mustUse.filter((id) => id !== card.id);
      return finishIfEmpty(state, p);
    }

    case "swapJoker": {
      if (state.phase !== "play") fail("Draw a card first.");
      if (!state.config.jokerSwap) fail("Joker swaps are turned off in these rules.");
      if (!state.opened[p]) fail("You can swap a joker only after opening.");
      const meld = state.table.find((m) => m.id === action.meldId) ?? fail("That meld is not on the table.");
      const card = hand.find((c) => c.id === action.cardId) ?? fail("That card is not in your hand.");
      const joker = meld.cards.find((c) => c.joker) ?? fail("That meld has no joker.");
      if (!jokerStandsFor(meld.cards).includes(shortId(card.id))) fail(`${shortId(card.id)} is not the card the joker stands for.`);
      takeFromHand(hand, card.id);
      meld.cards = orderMeld(meld.cards.map((c) => (c.id === joker!.id ? card : c)));
      if (!canUseCard(state, p, joker!)) fail("You could not use that joker this turn, so you cannot swap it.");
      hand.push(joker!);
      state.mustUse = state.mustUse.filter((id) => id !== card.id);
      state.mustUse.push(joker!.id);
      return state;
    }

    case "discard": {
      if (state.phase !== "play") fail("Draw a card first.");
      const waiting = state.mustUse.filter((id) => hand.some((c) => c.id === id));
      if (waiting.length) {
        fail(`You must lay down ${waiting.map(shortId).join(", ")} before discarding.`);
      }
      const card = takeFromHand(hand, action.cardId);
      state.discard.push(card);
      state.discarded[p].push(card.id);
      state.mustUse = [];
      if (hand.length === 0) {
        state.phase = "over";
        state.winner = p;
        return state;
      }
      state.turn += 1;
      state.current = other(p);
      state.phase = "draw";
      if (state.turn >= MAX_TURNS) return endOnPenalties(state);
      return state;
    }
  }
}

export const isRoundOver = (state: GameState) => state.phase === "over";

/** Penalty per player: 0 for the winner, 100 if never opened, else the cards left (joker 25). Both values come from the config. */
export function scoreRound(state: GameState): [number, number] {
  const { neverOpenedPenalty = 100, jokerPenalty = 25 } = state.config;
  const score = (p: Player) => {
    if (state.winner === p) return 0;
    if (!state.opened[p]) return neverOpenedPenalty;
    return state.hands[p].reduce((s, c) => s + penaltyPoints(c, jokerPenalty), 0);
  };
  return [score(0), score(1)];
}

/** Every legal action for the current player. Lay-downs are summarised by the best available one. */
export function legalActions(state: GameState): Action[] {
  if (state.phase === "over") return [];
  const p = state.current;
  const hand = state.hands[p];
  if (state.phase === "draw") {
    const actions: Action[] = [{ type: "drawStock" }];
    const top = topDiscard(state);
    if (top && (!state.config.discardMustBeUsed || canUseCard(state, p, top))) actions.push({ type: "drawDiscard" });
    return actions;
  }
  const actions: Action[] = [];
  const best = findMelds(hand, state.opened[p] ? "deadwood" : "opening");
  if (best.melds.length && (state.opened[p] || best.meldPoints >= state.config.openingMin)) {
    actions.push({ type: "layDown", melds: best.melds.map((m) => m.map((c) => c.id)) });
  }
  // Lay-downs that place a card that must be used this turn.
  for (const id of state.mustUse) {
    const card = hand.find((c) => c.id === id);
    if (!card) continue;
    for (const meld of meldsContaining(hand, card)) {
      const ids = meld.map((c) => c.id);
      if (state.opened[p]) actions.push({ type: "layDown", melds: [ids] });
      else {
        const rest = findMelds(hand.filter((c) => !ids.includes(c.id)), "opening");
        actions.push({ type: "layDown", melds: [ids, ...rest.melds.map((m) => m.map((c) => c.id))] });
      }
    }
  }
  if (state.opened[p]) {
    for (const card of hand) {
      for (const meld of state.table) {
        if (canLayOff(card, meld.cards)) actions.push({ type: "layOff", cardId: card.id, meldId: meld.id });
        if (meld.cards.some((c) => c.joker) && jokerStandsFor(meld.cards).includes(shortId(card.id))) {
          const swap: Action = { type: "swapJoker", cardId: card.id, meldId: meld.id };
          try {
            applyAction(state, swap);
            actions.push(swap);
          } catch {
            /* the joker could not be used this turn */
          }
        }
      }
    }
  }
  const waiting = state.mustUse.some((id) => hand.some((c) => c.id === id));
  if (!waiting) for (const card of hand) actions.push({ type: "discard", cardId: card.id });
  return actions.filter((action) => {
    if (action.type === "discard" || action.type === "swapJoker") return true; // already checked
    try {
      applyAction(state, action);
      return true;
    } catch {
      return false;
    }
  });
}

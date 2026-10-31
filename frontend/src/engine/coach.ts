import { Card, shortId } from "./cards";
import { canLayOff, findMelds, isValidMeld, jokerStandsFor } from "./melds";
import { GameState, Player, other } from "./state";
import { applyAction } from "./rules";

export type CoachAlertKind = "missed_lay_off" | "joker_swap" | "opening_reachable" | "feeds_opponent";

export type CoachAlert = { kind: CoachAlertKind; cards: string[]; text: string };

const face = (id: string) => shortId(id).replace("T", "10");

export function opponentKnownCards(state: GameState, player: Player): Card[] {
  const opp = other(player);
  const onTable = new Set(state.table.flatMap((m) => m.cards.map((c) => c.id)));
  const discarded = new Set(state.discarded[opp]);
  return state.taken[opp].filter((c) => !onTable.has(c.id) && !discarded.has(c.id));
}

export function feedsOpponent(state: GameState, player: Player, card: Card): string | null {
  if (state.opened[other(player)] && state.table.some((m) => canLayOff(card, m.cards))) {
    return `${face(card.id)} fits a meld on the table and your opponent has opened`;
  }
  const known = opponentKnownCards(state, player);
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      if (isValidMeld([card, known[i], known[j]])) {
        return `your opponent took ${face(known[i].id)} and ${face(known[j].id)}, and ${face(card.id)} completes a meld with them`;
      }
    }
  }
  return null;
}

export function coachAlerts(state: GameState, player: Player, selected: Card | null): CoachAlert[] {
  if (state.phase !== "play" || state.current !== player) return [];
  const hand = state.hands[player];
  const alerts: CoachAlert[] = [];

  if (!state.opened[player]) {
    const opening = findMelds(hand, "opening");
    if (opening.melds.length && opening.meldPoints >= state.config.openingMin) {
      alerts.push({
        kind: "opening_reachable",
        cards: opening.melds.flat().map((c) => c.id),
        text: `You can open now: your melds are worth ${opening.meldPoints} points (${state.config.openingMin} needed).`,
      });
    }
  } else {
    const layOffs = hand.filter((c) => state.table.some((m) => canLayOff(c, m.cards)));
    if (layOffs.length) {
      alerts.push({
        kind: "missed_lay_off",
        cards: layOffs.map((c) => c.id),
        text: `${layOffs.map((c) => face(c.id)).join(", ")} can go on a meld on the table.`,
      });
    }
    if (state.config.jokerSwap) {
      const swaps: string[] = [];
      for (const card of hand) {
        if (card.joker) continue;
        for (const meld of state.table) {
          if (!meld.cards.some((c) => c.joker) || !jokerStandsFor(meld.cards).includes(shortId(card.id))) continue;
          try {
            applyAction(state, { type: "swapJoker", cardId: card.id, meldId: meld.id });
            swaps.push(card.id);
          } catch {
          }
        }
      }
      if (swaps.length) {
        alerts.push({
          kind: "joker_swap",
          cards: swaps,
          text: `${swaps.map(face).join(", ")} can replace a joker on the table, and you can use that joker now.`,
        });
      }
    }
  }

  if (selected) {
    const why = feedsOpponent(state, player, selected);
    if (why) alerts.push({ kind: "feeds_opponent", cards: [selected.id], text: `Careful with ${face(selected.id)}: ${why}.` });
  }
  return alerts;
}

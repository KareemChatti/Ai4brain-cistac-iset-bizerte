// The hint engine. It deliberately uses the faster level-4 logic (which also weighs what
// the opponent collects), so it is sometimes wrong; its confidence says how often the
// hinted card was also the best choice across 30 sampled next draws.

import type { Hint } from "@shared/types";
import { Card, penaltyPoints, shortId, shuffle } from "./cards";
import { Evaluator, View, discardCandidates, isDangerous, viewOf } from "./eval";
import { canUseCard } from "./rules";
import { rankByLookahead } from "./ai";
import { findMelds, isNearMeld } from "./melds";
import { GameState, Player, topDiscard } from "./state";

const SUIT_NAMES: Record<string, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };

let counter = 0;
const newHintId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `h${Date.now()}-${++counter}`;

export function getHint(state: GameState, player: Player, rng: () => number = Math.random): Hint {
  const view = viewOf(state, player);
  const ev = new Evaluator(view.table, view.opened, view.config);

  if (state.phase === "draw") {
    const top = topDiscard(state);
    if (top && canUseCard(state, player, top) && ev.distance([...view.hand, top]) < ev.distance(view.hand)) {
      return { hint_id: newHintId(), action: "draw_discard", card: top.id, confidence: 0.85, reason_codes: ["discard_completes_meld"] };
    }
    return { hint_id: newHintId(), action: "draw_stock", card: null, confidence: 0.7, reason_codes: ["discard_not_useful"] };
  }

  const opening = findMelds(view.hand, view.opened ? "deadwood" : "opening");
  if (opening.melds.length && (view.opened || opening.meldPoints >= view.config.openingMin)) {
    return {
      hint_id: newHintId(),
      action: "lay_down",
      card: null,
      confidence: 0.95,
      reason_codes: view.opened ? ["keeps_run_open"] : ["needed_for_opening"],
    };
  }

  const candidates = discardCandidates(view.hand, state.mustUse);
  const ranked = rankByLookahead(view, candidates);
  const card = ranked[0].card;
  return {
    hint_id: newHintId(),
    action: "discard",
    card: card.id,
    confidence: discardConfidence(view, candidates, card, ev, rng),
    reason_codes: reasonsFor(card, view),
  };
}

/** Share of 30 sampled next draws for which `card` is (one of) the best discards. */
function discardConfidence(view: View, candidates: Card[], card: Card, ev: Evaluator, rng: () => number): number {
  const sample = shuffle(view.unseen, rng).slice(0, 30);
  if (!sample.length) return 0.5;
  let agree = 0;
  for (const draw of sample) {
    const score = (d: Card) => ev.distance([...view.hand.filter((c) => c.id !== d.id), draw]);
    const best = Math.min(...candidates.map(score));
    if (score(card) <= best) agree++;
  }
  return Math.round((agree / sample.length) * 100) / 100;
}

function reasonsFor(card: Card, view: View): string[] {
  const reasons: string[] = [];
  const rest = view.hand.filter((c) => c.id !== card.id);
  if (!isNearMeld(card, view.hand)) reasons.push(penaltyPoints(card) >= 10 ? "isolated_high_card" : "safe_discard");
  const pairs = rest.filter((c) => isNearMeld(c, rest));
  if (pairs.some((c) => rest.some((o) => o.id !== c.id && o.suit === c.suit && o.rank !== c.rank))) reasons.push("keeps_run_open");
  if (pairs.some((c) => rest.some((o) => o.id !== c.id && o.rank === c.rank))) reasons.push("keeps_set_open");
  if (!view.opened) reasons.push("needed_for_opening");
  const suits = view.opponentTaken.filter((c) => !c.joker).map((c) => c.suit!);
  if (suits.length) {
    const top = suits.sort((a, b) => suits.filter((s) => s === b).length - suits.filter((s) => s === a).length)[0];
    if (top !== card.suit) reasons.push(`opponent_collects_${SUIT_NAMES[top]}`);
  }
  if (!isDangerous(card, view) && !reasons.includes("safe_discard")) reasons.push("safe_discard");
  return reasons.slice(0, 3);
}

/** Plain-language versions of the reason codes, for the hint panel. */
export const REASON_TEXT: Record<string, string> = {
  keeps_run_open: "keeps your runs open",
  keeps_set_open: "keeps your sets open",
  isolated_high_card: "it is a high card that fits nothing",
  needed_for_opening: "you still need points to open",
  discard_completes_meld: "the top discard completes a meld",
  discard_not_useful: "the top discard does not help your hand",
  safe_discard: "it is unlikely to help your opponent",
  opponent_collects_spades: "your opponent seems to collect spades",
  opponent_collects_hearts: "your opponent seems to collect hearts",
  opponent_collects_diamonds: "your opponent seems to collect diamonds",
  opponent_collects_clubs: "your opponent seems to collect clubs",
};

export const describeCard = (id: string | null) => (id ? shortId(id).replace("T", "10") : "");

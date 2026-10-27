// The turn grader: how good was a discard, given only what the player could see?
//
// For every possible discard d we estimate T(d), the expected number of turns still
// needed to go out after discarding d and drawing the next card (averaged over every
// unseen card). Then
//     quality = 1 - (T_played - T_best) / max(1, T_worst - T_best)
// so the best discard scores 1 and the worst scores 0, whatever luck the deal brings.

import { Card, GameConfig, configFor, parseCard, shortId } from "./cards";
import { Evaluator, View, discardCandidates, drawDistribution, expectedDistance, viewOf } from "./eval";
import { setMeldRules } from "./melds";
import { GameState, Player } from "./state";

/** Serialisable copy of a decision point, sent to the grading worker. */
export type GradeInput = {
  hand: string[];
  table: string[][];
  opened: boolean;
  quick: boolean;
  unseen: string[];
  opponentTaken: string[];
  opponentOpened: boolean;
  /** The round's rules (older callers only send `quick`). */
  config?: GameConfig;
};

export type TurnGrade = {
  quality: number;
  best_discard: string;
  turns_to_out_played: number;
  turns_to_out_best: number;
  /** Expected turns to go out for each possible discard, by face ("8H"). */
  scores: Record<string, number>;
};

export function gradeInput(state: GameState, player: Player): GradeInput {
  const view = viewOf(state, player);
  return {
    hand: view.hand.map((c) => c.id),
    table: view.table.map((m) => m.map((c) => c.id)),
    opened: view.opened,
    quick: state.config.decks === 1,
    unseen: view.unseen.map((c) => c.id),
    opponentTaken: view.opponentTaken.map((c) => c.id),
    opponentOpened: view.opponentOpened,
    config: state.config,
  };
}

export function viewFromInput(input: GradeInput): View {
  const config: GameConfig = input.config ?? configFor(input.quick);
  setMeldRules(config); // the worker has its own copy of the meld rules
  return {
    hand: input.hand.map(parseCard),
    table: input.table.map((m) => m.map(parseCard)),
    opened: input.opened,
    config,
    unseen: input.unseen.map(parseCard),
    opponentTaken: input.opponentTaken.map(parseCard),
    opponentOpened: input.opponentOpened,
  };
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

/** Expected turns to go out for each discard candidate (one per face). */
export function discardScores(view: View): Map<string, { card: Card; turns: number }> {
  const ev = new Evaluator(view.table, view.opened, view.config);
  const draws = drawDistribution(view.unseen);
  const scores = new Map<string, { card: Card; turns: number }>();
  for (const card of discardCandidates(view.hand)) {
    scores.set(shortId(card.id), { card, turns: 1 + expectedDistance(view, card, ev, draws) });
  }
  return scores;
}

export function gradeTurn(input: GradeInput, playedDiscard: string): TurnGrade {
  const view = viewFromInput(input);
  const scores = discardScores(view);
  const played = shortId(playedDiscard);
  const entries = [...scores.values()];
  const best = entries.reduce((a, b) => (b.turns < a.turns ? b : a));
  const worst = Math.max(...entries.map((e) => e.turns));
  // A joker discard is never a candidate (unless only jokers are left): grade it as the worst move.
  const tPlayed = scores.get(played)?.turns ?? worst;
  const quality = Math.min(1, Math.max(0, 1 - (tPlayed - best.turns) / Math.max(1, worst - best.turns)));
  return {
    quality: round(quality, 2),
    best_discard: best.card.id,
    turns_to_out_played: round(tPlayed, 1),
    turns_to_out_best: round(best.turns, 1),
    scores: Object.fromEntries([...scores].map(([k, v]) => [k, round(v.turns, 3)])),
  };
}

/** A hint was good if the hinted card is within 0.3 turns of the best discard. */
export function hintWasGood(hintCard: string, grade: TurnGrade): boolean {
  const hinted = grade.scores[shortId(hintCard)];
  if (hinted === undefined) return false;
  return hinted - Math.min(...Object.values(grade.scores)) <= 0.3;
}

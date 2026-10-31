import { Card, GameConfig, configFor, parseCard, shortId } from "./cards";
import { Evaluator, View, discardCandidates, drawDistribution, expectedDistance, viewOf } from "./eval";
import { setMeldRules } from "./melds";
import { GameState, Player } from "./state";

export type GradeInput = {
  hand: string[];
  table: string[][];
  opened: boolean;
  quick: boolean;
  unseen: string[];
  opponentTaken: string[];
  opponentOpened: boolean;
  config?: GameConfig;
};

export type TurnGrade = {
  quality: number;
  best_discard: string;
  turns_to_out_played: number;
  turns_to_out_best: number;
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
  setMeldRules(config);
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

export function hintWasGood(hintCard: string, grade: TurnGrade): boolean {
  const hinted = grade.scores[shortId(hintCard)];
  if (hinted === undefined) return false;
  return hinted - Math.min(...Object.values(grade.scores)) <= 0.3;
}

import { Card, GameConfig, makeDeck, mulberry32, shuffle } from "./cards";
import { MeldKind, setMeldRules } from "./melds";

export type Player = 0 | 1;
export type Phase = "draw" | "play" | "over";

export type TableMeld = { id: number; owner: Player; kind: MeldKind; cards: Card[] };

export type GameState = {
  config: GameConfig;
  seed: number;
  stock: Card[];
  discard: Card[];
  hands: [Card[], Card[]];
  table: TableMeld[];
  nextMeldId: number;
  opened: [boolean, boolean];
  current: Player;
  phase: Phase;
  turn: number;
  mustUse: string[];
  taken: [Card[], Card[]];
  discarded: [string[], string[]];
  reshuffles: number;
  winner: Player | null;
};

export const other = (p: Player): Player => (p === 0 ? 1 : 0);

export function newGame(seed: number, config: GameConfig, firstPlayer: Player = 0): GameState {
  setMeldRules(config);
  const rng = mulberry32(seed);
  const stock = shuffle(makeDeck(config), rng);
  const hands: [Card[], Card[]] = [[], []];
  for (let i = 0; i < config.handSize; i++) {
    hands[firstPlayer].push(stock.pop()!);
    hands[other(firstPlayer)].push(stock.pop()!);
  }
  hands[firstPlayer].push(stock.pop()!);
  return {
    config,
    seed,
    stock,
    discard: [],
    hands,
    table: [],
    nextMeldId: 1,
    opened: [false, false],
    current: firstPlayer,
    phase: "play",
    turn: 0,
    mustUse: [],
    taken: [[], []],
    discarded: [[], []],
    reshuffles: 0,
    winner: null,
  };
}

export const topDiscard = (state: GameState): Card | null => state.discard[state.discard.length - 1] ?? null;

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    stock: s.stock.slice(),
    discard: s.discard.slice(),
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    table: s.table.map((m) => ({ ...m, cards: m.cards.slice() })),
    opened: [s.opened[0], s.opened[1]],
    mustUse: s.mustUse.slice(),
    taken: [s.taken[0].slice(), s.taken[1].slice()],
    discarded: [s.discarded[0].slice(), s.discarded[1].slice()],
  };
}

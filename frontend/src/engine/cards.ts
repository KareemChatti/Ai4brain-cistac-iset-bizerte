export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K";

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];

export type Card = {
  id: string;
  rank: Rank | null;
  suit: Suit | null;
  deck: number;
  joker: boolean;
};

export type GameConfig = {
  decks: number;
  jokers: number;
  handSize: number;
  openingMin: number;
  jokerPenalty: number;
  neverOpenedPenalty: number;
  discardMustBeUsed: boolean;
  jokerSwap: boolean;
  aceHigh: boolean;
  mustDiscardToGoOut: boolean;
};

const COMMON_RULES = {
  jokerPenalty: 25,
  neverOpenedPenalty: 100,
  discardMustBeUsed: true,
  jokerSwap: true,
  aceHigh: true,
  mustDiscardToGoOut: false,
};

export const FULL_CONFIG: GameConfig = { decks: 2, jokers: 4, handSize: 14, openingMin: 71, ...COMMON_RULES };
export const QUICK_CONFIG: GameConfig = { decks: 1, jokers: 2, handSize: 10, openingMin: 40, ...COMMON_RULES };

export const configFor = (quickMode: boolean): GameConfig => (quickMode ? QUICK_CONFIG : FULL_CONFIG);

export const withDefaults = (config: Partial<GameConfig>): GameConfig => ({ ...FULL_CONFIG, ...config });

export const rankValue = (rank: Rank): number => RANKS.indexOf(rank) + 1;

export const rankFromValue = (value: number): Rank => RANKS[(value === 14 ? 1 : value) - 1];

export function parseCard(id: string): Card {
  const [code, deckText] = id.split(".");
  const deck = Number(deckText ?? 1);
  if (code === "JK") return { id, rank: null, suit: null, deck, joker: true };
  return { id, rank: code[0] as Rank, suit: code[1] as Suit, deck, joker: false };
}

export const shortId = (id: string) => id.split(".")[0];

export function makeDeck(config: GameConfig): Card[] {
  const cards: Card[] = [];
  for (let deck = 1; deck <= config.decks; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ id: `${rank}${suit}.${deck}`, rank, suit, deck, joker: false });
    }
  }
  for (let j = 1; j <= config.jokers; j++) cards.push({ id: `JK.${j}`, rank: null, suit: null, deck: j, joker: true });
  return cards;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function penaltyPoints(card: Card, jokerPenalty = 25): number {
  if (card.joker) return jokerPenalty;
  const v = rankValue(card.rank!);
  if (v === 1) return 11;
  return Math.min(v, 10);
}

export function meldRankPoints(value: number): number {
  if (value === 1) return 1;
  if (value === 14) return 11;
  return Math.min(value, 10);
}

export const isRed = (card: Card) => card.suit === "H" || card.suit === "D";

export function sortHand(cards: Card[], by: "suit" | "rank" = "suit"): Card[] {
  return cards.slice().sort((a, b) => {
    if (a.joker !== b.joker) return a.joker ? 1 : -1;
    if (a.joker) return a.deck - b.deck;
    const suitDiff = SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!);
    const rankDiff = rankValue(a.rank!) - rankValue(b.rank!);
    return by === "suit" ? suitDiff || rankDiff || a.deck - b.deck : rankDiff || suitDiff || a.deck - b.deck;
  });
}

import { create } from "zustand";
import { FULL_CONFIG, GameConfig, QUICK_CONFIG, withDefaults } from "../engine";
import { logEvent } from "./logger";

export type MatchTarget = 401 | 501 | 701 | 1001 | null;
export const MATCH_TARGETS: MatchTarget[] = [401, 501, 701, 1001, null];

export type RamiRules = GameConfig & {
  matchTarget: MatchTarget;
  opponentLevel: number;
  hintsEnabled: boolean;
  liveCoach: boolean;
};

const EXTRAS = { matchTarget: 401 as MatchTarget, opponentLevel: 3, hintsEnabled: true, liveCoach: true };
export const DEFAULT_RULES: RamiRules = { ...FULL_CONFIG, ...EXTRAS };
export const QUICK_RULES: RamiRules = { ...QUICK_CONFIG, ...EXTRAS };

export const gameConfigOf = (r: RamiRules): GameConfig => withDefaults(r);

export type MatchRound = { round_id: string; user: number; ai: number; winner: "user" | "ai" };
export type Match = {
  match_id?: string;
  target: number;
  rounds: MatchRound[];
  totals: [number, number];
  winner: "user" | "ai" | null;
};

const KEYS = { rules: "ai4brain.rami_rules", match: "ai4brain.rami_match" } as const;

function load<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

export function matchWinner(totals: [number, number], target: number): "user" | "ai" | null {
  if (totals[0] < target && totals[1] < target) return null;
  return totals[0] <= totals[1] ? "user" : "ai";
}

type MatchState = {
  rules: RamiRules;
  match: Match | null;
  setRules: (rules: RamiRules) => void;
  newMatch: () => void;
  ensureMatch: () => string | null;
  recordRound: (round: MatchRound) => void;
  endMatch: () => void;
};

export const useMatch = create<MatchState>((set, get) => ({
  rules: { ...DEFAULT_RULES, ...(load<Partial<RamiRules>>(KEYS.rules) ?? {}) },
  match: load<Match>(KEYS.match),
  setRules: (rules) => {
    save(KEYS.rules, rules);
    set({ rules });
  },
  newMatch: () => {
    const { rules } = get();
    const target = rules.matchTarget;
    const match: Match | null = target
      ? { match_id: crypto.randomUUID(), target, rounds: [], totals: [0, 0], winner: null }
      : null;
    save(KEYS.match, match);
    set({ match });
    if (match) {
      logEvent("rami", "match_start", {
        match_id: match.match_id,
        target,
        rules: {
          decks: rules.decks,
          jokers: rules.jokers,
          hand_size: rules.handSize,
          opening_min: rules.openingMin,
          opponent_level: rules.opponentLevel,
        },
      });
    }
  },
  ensureMatch: () => {
    if (!get().rules.matchTarget) return null;
    const m = get().match;
    if (!m || m.winner || !m.match_id) get().newMatch();
    return get().match?.match_id ?? null;
  },
  recordRound: (round) => {
    if (!get().rules.matchTarget) return;
    get().ensureMatch();
    const m = get().match!;
    if (m.rounds.some((r) => r.round_id === round.round_id)) return;
    const totals: [number, number] = [m.totals[0] + round.user, m.totals[1] + round.ai];
    const match: Match = { ...m, rounds: [...m.rounds, round], totals, winner: matchWinner(totals, m.target) };
    save(KEYS.match, match);
    set({ match });
    if (match.winner) {
      logEvent("rami", "match_end", {
        match_id: match.match_id,
        winner: match.winner,
        user_total: totals[0],
        ai_total: totals[1],
        rounds: match.rounds.length,
        target: match.target,
      });
    }
  },
  endMatch: () => {
    save(KEYS.match, null);
    set({ match: null });
  },
}));

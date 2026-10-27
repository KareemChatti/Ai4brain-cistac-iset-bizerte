// House rules and the running match, both kept in localStorage.
// A match is a series of rounds: penalties add up, and the first player whose total
// reaches the target (401, 501, 701 or 1001) loses. Target null = single rounds.

import { create } from "zustand";
import { FULL_CONFIG, GameConfig, QUICK_CONFIG, withDefaults } from "../engine";

export type MatchTarget = 401 | 501 | 701 | 1001 | null;
export const MATCH_TARGETS: MatchTarget[] = [401, 501, 701, 1001, null];

export type RamiRules = GameConfig & {
  matchTarget: MatchTarget;
  opponentLevel: number;
  hintsEnabled: boolean;
  /** Coach checks during the turn (missed lay-off, joker swap, opening, feeding the opponent). */
  liveCoach: boolean;
};

const EXTRAS = { matchTarget: 401 as MatchTarget, opponentLevel: 3, hintsEnabled: true, liveCoach: true };
export const DEFAULT_RULES: RamiRules = { ...FULL_CONFIG, ...EXTRAS };
export const QUICK_RULES: RamiRules = { ...QUICK_CONFIG, ...EXTRAS };

/** The engine's part of the rules. */
export const gameConfigOf = (r: RamiRules): GameConfig => withDefaults(r);

export type MatchRound = { round_id: string; user: number; ai: number; winner: "user" | "ai" };
export type Match = {
  target: number;
  rounds: MatchRound[];
  totals: [number, number];
  /** Set when a total reaches the target. */
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
    /* private mode: keep it in memory only */
  }
}

/** Who won once a total reached the target: the lower total (the user on a tie, which needs both over). */
export function matchWinner(totals: [number, number], target: number): "user" | "ai" | null {
  if (totals[0] < target && totals[1] < target) return null;
  return totals[0] <= totals[1] ? "user" : "ai";
}

type MatchState = {
  rules: RamiRules;
  match: Match | null;
  setRules: (rules: RamiRules) => void;
  /** Start a match with the current target (or clear it for single rounds). */
  newMatch: () => void;
  /** Add one finished round. Starts a match first if none is running. */
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
    const target = get().rules.matchTarget;
    const match: Match | null = target ? { target, rounds: [], totals: [0, 0], winner: null } : null;
    save(KEYS.match, match);
    set({ match });
  },
  recordRound: (round) => {
    if (!get().rules.matchTarget) return;
    if (!get().match || get().match!.winner) get().newMatch();
    const m = get().match!;
    if (m.rounds.some((r) => r.round_id === round.round_id)) return;
    const totals: [number, number] = [m.totals[0] + round.user, m.totals[1] + round.ai];
    const match: Match = { ...m, rounds: [...m.rounds, round], totals, winner: matchWinner(totals, m.target) };
    save(KEYS.match, match);
    set({ match });
  },
  endMatch: () => {
    save(KEYS.match, null);
    set({ match: null });
  },
}));

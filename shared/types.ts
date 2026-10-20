// Shared contract in code. Source of truth: docs/contracts.md. Change both together.

export type DimensionKey = "memory" | "attention" | "speed" | "reasoning" | "flexibility";
export const DIMENSIONS: DimensionKey[] = ["memory", "attention", "speed", "reasoning", "flexibility"];

export type MiniGameId = "card_recall" | "meld_spotter" | "quick_match" | "rami_puzzle" | "rule_switch";

// ---------- events ----------
export type EventSource = "rami" | "minigame" | "coach" | "app";

export type Event = {
  event_id: string;
  user_id: string;
  session_id: string;
  round_id: string | null;
  ts: string;
  source: EventSource;
  type: string;
  payload: Record<string, unknown>;
};

export type TurnPayload = {
  turn_no: number;
  draw_source: "stock" | "discard";
  drawn: string;
  discarded: string | null;
  laid_down: string[][];
  laid_off: number;
  joker_swaps: number;
  think_ms: number;
  options_count: number;
  missed: { lay_offs: number; joker_swaps: number; melds_in_hand: number };
  fed_opponent: boolean;
  quality: number | null;
  best_discard: string | null;
  turns_to_out_played: number | null;
  turns_to_out_best: number | null;
};

// ---------- backend responses ----------
export type DimensionEstimate = { score: number; low: number; high: number; n_obs: number; trend: number };

export type Profile = {
  user_id: string;
  updated_at: string;
  dimensions: Record<DimensionKey, DimensionEstimate>;
  n_rounds: number;
  n_minigames: number;
  flags: { suggest_break: boolean };
};

export type Snapshot = {
  ts: string;
  trigger: "round" | "minigame";
  dimensions: Record<DimensionKey, DimensionEstimate>;
};

export type Projection = {
  sessions_per_week: number;
  weeks: number;
  points: { week: number; dimension: DimensionKey; score: number; low: number; high: number }[];
  disclaimer: string;
};

export type PlanStep = { kind: "minigame" | "rami"; game?: MiniGameId; level?: number };
export type Plan = {
  focus: DimensionKey;
  reason: string;
  opponent_level: number;
  quick_mode: boolean;
  steps: PlanStep[];
};

export type CollabComponent = "clarification" | "verification" | "iteration" | "autonomy" | "responsible_use";
export type CollabScore = {
  total: number | null;
  components: Record<CollabComponent, { score: number | null; n: number }>;
  weights: Record<CollabComponent, number>;
};

export type Heatmap = { rows: DimensionKey[]; cols: string[]; cells: (number | null)[][] };

export type Goal = { dimension: DimensionKey; target: number; created_at: string; progress: number };

export type Fact = {
  id: string;
  dimension: DimensionKey | "general";
  kind: string;
  turn_no: number | null;
  text: string;
  value: number | null;
};

export type EvidenceSheet = {
  round_id: string;
  user_id: string;
  result: "win" | "loss" | "abandoned";
  facts: Fact[];
  stats: Record<string, number>;
  profile_delta: Partial<Record<DimensionKey, number>>;
};

export type Review = {
  round_id: string;
  headline: string;
  key_moments: { turn_no: number; title: string; explanation: string; tip: string; fact_ids: string[] }[];
  strengths: { text: string; fact_ids: string[] }[];
  next_focus: { dimension: DimensionKey; text: string; fact_ids: string[] };
  voice_text: string;
  source: "llm" | "template";
};

// ---------- game <-> shell ----------
export type Hint = {
  hint_id: string;
  action: "draw_stock" | "draw_discard" | "discard" | "lay_down";
  card: string | null;
  confidence: number;
  reason_codes: string[];
};

export type HintActions = {
  follow: () => void;
  ignore: () => void;
  why: () => void;     // M3 calls /api/coach/explain-hint and logs hint_why
  check: () => void;   // opens the card tracker, logs hint_checked
};

export type RoundSummary = { round_id: string; winner: "user" | "ai"; turns: number; user_penalty: number };
export type MiniGameResult = { game: MiniGameId; level_end: number; accuracy: number; n_trials: number };

import type { ComponentType } from "react";
import type { DimensionKey, MiniGameId } from "@shared/types";

/** One answer inside a mini-game. */
export type TrialResult = { correct: boolean; rtMs: number; extra?: Record<string, unknown> };

/** What the host gives every game. */
export type MiniGameProps = {
  /** Current difficulty, adapted by the host's 2-up/1-down staircase after each trial. */
  level: number;
  /** Report one answer. The host logs a `trial` event and updates the level. */
  record: (result: TrialResult) => void;
  /** End the game early (most games just wait for `timeUp`). */
  finish: () => void;
  /** True once the time budget is spent: finish the current trial, start no new one. */
  timeUp: boolean;
  rng: () => number;
};

export type MiniGameDefinition = {
  id: MiniGameId | string;
  dimension: DimensionKey;
  title: string;
  instructions: string[];
  minLevel: number;
  maxLevel: number;
  /** Time budget in milliseconds. */
  durationMs: number;
  /** The `score_raw` sent with minigame_end, from the trials of the game. */
  scoreRaw: (trials: (TrialResult & { level: number })[]) => number;
  Component: ComponentType<MiniGameProps>;
};

import { create } from "zustand";
import type { PlanStep } from "@shared/types";

/** Walks the user through today's plan, one step after another. */
type PlanRun = {
  steps: PlanStep[];
  index: number; // -1 when no plan is running
  opponentLevel: number;
  quickMode: boolean;
  start: (steps: PlanStep[], opponentLevel: number, quickMode: boolean) => void;
  advance: () => void;
  stop: () => void;
};

export const usePlanRun = create<PlanRun>((set) => ({
  steps: [],
  index: -1,
  opponentLevel: 3,
  quickMode: true,
  start: (steps, opponentLevel, quickMode) => set({ steps, index: steps.length ? 0 : -1, opponentLevel, quickMode }),
  advance: () => set((s) => ({ index: s.index + 1 < s.steps.length ? s.index + 1 : -1 })),
  stop: () => set({ index: -1, steps: [] }),
}));

export function stepPath(step: PlanStep): string {
  if (step.kind === "rami") return "/play";
  return `/train/${step.game ?? "card_recall"}${step.level ? `?level=${step.level}` : ""}`;
}

/** Path of the step after the current one, or null when the plan is finished. */
export function nextStepPath(): string | null {
  const { advance } = usePlanRun.getState();
  advance();
  const { index, steps } = usePlanRun.getState();
  return index >= 0 ? stepPath(steps[index]) : null;
}

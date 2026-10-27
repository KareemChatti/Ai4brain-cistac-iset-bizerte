// Mount point for Member 1's Rami table. When src/game/index.ts(x) exports RamiTable it is
// picked up automatically; until then a placeholder with the same props (docs/contracts.md
// section 2) is shown.

import type { ComponentType, ReactNode } from "react";
import type { Hint, HintActions, RoundSummary } from "@shared/types";
import type { GameConfig } from "@/engine";

export type RamiTableProps = {
  userId: string;
  sessionId: string;
  opponentLevel: number;
  quickMode: boolean;
  hintsEnabled?: boolean;
  onRoundEnd: (summary: RoundSummary) => void;
  renderHintPanel?: (hint: Hint, actions: HintActions) => ReactNode;
  config?: GameConfig;
  liveCoach?: boolean;
  onRoundScored?: (round: { round_id: string; user: number; ai: number; winner: "user" | "ai" }) => void;
};

type AnyModule = Record<string, unknown>;
const gameModules = import.meta.glob<AnyModule>("../game/index.{ts,tsx}", { eager: true });

function pick<P>(mods: Record<string, AnyModule>, name: string): ComponentType<P> | null {
  for (const mod of Object.values(mods)) {
    const c = mod[name];
    if (typeof c === "function" || (typeof c === "object" && c !== null)) return c as ComponentType<P>;
  }
  return null;
}

function RamiTablePlaceholder({ onRoundEnd, quickMode, opponentLevel }: RamiTableProps) {
  return (
    <div className="card flex flex-col items-center gap-4 border-dashed bg-brand-light text-center">
      <p className="font-semibold">The Rami table goes here.</p>
      <p className="text-sm text-slate-600">
        Opponent level {opponentLevel}, {quickMode ? "quick round" : "full round"}. This placeholder is replaced
        when the game component is ready.
      </p>
      <button
        className="btn-primary"
        onClick={() =>
          onRoundEnd({ round_id: "22222222-2222-4222-8222-222222222222", winner: "user", turns: 12, user_penalty: 0 })
        }
      >
        Finish a sample round
      </button>
    </div>
  );
}

export const RamiTable = pick<RamiTableProps>(gameModules, "RamiTable") ?? RamiTablePlaceholder;

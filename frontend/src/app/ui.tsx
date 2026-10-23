import type { ReactNode } from "react";
import type { DimensionKey } from "@shared/types";

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  memory: "Memory",
  attention: "Attention",
  speed: "Speed",
  reasoning: "Reasoning",
  flexibility: "Flexibility",
};

export const GAME_LABELS: Record<string, string> = {
  card_recall: "Card recall",
  meld_spotter: "Meld spotter",
  quick_match: "Quick match",
  rami_puzzle: "Rami puzzle",
  rule_switch: "Rule switch",
};

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-brand sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-slate-600">{sub}</p>}
    </header>
  );
}

export function Loading() {
  return <p className="text-slate-500">Loading…</p>;
}

export function ErrorNote({ error }: { error: Error }) {
  return (
    <p className="rounded-xl bg-slate-100 p-4 text-slate-700">
      Something went wrong while loading. Please try again. <span className="text-sm">({error.message})</span>
    </p>
  );
}

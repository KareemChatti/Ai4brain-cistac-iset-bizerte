import type { ReactNode } from "react";
import type { DimensionKey } from "@shared/types";

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  memory: "Memory",
  attention: "Attention",
  speed: "Speed",
  reasoning: "Reasoning",
  flexibility: "Flexibility",
};

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      <h1 className="text-page text-ink">{children}</h1>
      {sub && <p className="max-w-[60ch] text-ink-2">{sub}</p>}
    </header>
  );
}

export function Loading() {
  return (
    <p className="muted" role="status">
      Loading…
    </p>
  );
}

export function ErrorNote({ error }: { error: Error }) {
  return (
    <div className="well" role="alert">
      <p className="font-medium">Something went wrong while loading. Please try again.</p>
      <p className="mt-1 text-sm muted">{error.message}</p>
    </div>
  );
}

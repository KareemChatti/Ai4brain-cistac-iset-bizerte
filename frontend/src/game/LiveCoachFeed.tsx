// The live session on the table: a connection badge and the coach's messages for this round.

import { useRef } from "react";
import { useLive } from "./live";

const BADGE = {
  live: { dot: "bg-emerald-500", text: "Live coach connected" },
  connecting: { dot: "bg-amber-400 animate-pulse", text: "Connecting to the coach…" },
  offline: { dot: "bg-slate-400", text: "Offline: your moves are kept and sent when the connection is back" },
} as const;

export function LiveBadge() {
  const status = useLive((s) => s.status);
  if (status === "off") return null;
  const b = BADGE[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-600" role="status" aria-label="Live session">
      <span className={`h-2.5 w-2.5 rounded-full ${b.dot}`} />
      {b.text}
    </span>
  );
}

/** The last few coach messages of this round (and match summaries that arrive during it). */
export function LiveCoachFeed({ roundId, max = 3 }: { roundId: string; max?: number }) {
  const since = useRef(Date.now());
  const messages = useLive((s) => s.messages);
  const status = useLive((s) => s.status);
  const shown = messages.filter((m) => m.round_id === roundId || (m.round_id === null && m.at >= since.current)).slice(-max);
  if (status === "off" || !shown.length) return null;
  return (
    <section className="rounded-xl border border-brand/30 bg-brand-light px-4 py-3" aria-label="Live coach" aria-live="polite">
      <p className="text-sm font-semibold text-brand">Live coach</p>
      <ul className="mt-1 space-y-1">
        {shown.map((m) => (
          <li key={m.id} className="text-slate-700">
            {m.turn_no ? <span className="mr-2 text-xs text-slate-500">turn {m.turn_no}</span> : null}
            {m.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

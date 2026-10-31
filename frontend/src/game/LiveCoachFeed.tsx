// The live session on the table: a connection chip and the coach's messages for this round.

import { useRef } from "react";
import { useLive } from "./live";

const BADGE = {
  live: { tone: "bg-mint-deep", text: "Live coach connected" },
  connecting: { tone: "bg-accent-deep", text: "Connecting to the coach…" },
  offline: { tone: "bg-muted", text: "Offline: your moves are kept and sent when the connection is back" },
} as const;

/** A live state chip: the dot is the connection state, so it carries meaning. */
export function LiveBadge() {
  const status = useLive((s) => s.status);
  if (status === "off") return null;
  const b = BADGE[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2" role="status" aria-label="Live session">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${b.tone}`} aria-hidden="true" />
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
    <section className="well flex flex-col gap-2" aria-label="Live coach" aria-live="polite">
      <h3 className="text-base">From your coach</h3>
      <ul className="flex flex-col gap-2">
        {shown.map((m) => (
          <li key={m.id} className="text-ink-2">
            {m.turn_no ? <span className="mr-2 text-sm muted">Turn {m.turn_no}</span> : null}
            {m.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

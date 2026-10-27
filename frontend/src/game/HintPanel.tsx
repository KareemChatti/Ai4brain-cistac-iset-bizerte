// Default hint panel, used when the app does not pass its own renderHintPanel.

import type { Hint, HintActions } from "@shared/types";
import { REASON_TEXT, describeCard } from "../engine/hints";

export function hintInWords(hint: Hint): string {
  switch (hint.action) {
    case "draw_stock":
      return "Draw from the stock.";
    case "draw_discard":
      return `Take the ${describeCard(hint.card)} from the discard pile.`;
    case "lay_down":
      return "Lay down your melds now.";
    case "discard":
      return `Discard the ${describeCard(hint.card)}.`;
  }
}

export function DefaultHintPanel({ hint, actions, showWhy }: { hint: Hint; actions: HintActions; showWhy: boolean }) {
  const pct = Math.round(hint.confidence * 100);
  return (
    <div className="card border-amber-300 bg-amber-50" role="region" aria-label="Hint">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Hint</p>
      <p className="mt-1 text-lg font-semibold">{hintInWords(hint)}</p>
      <div className="mt-3">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Confidence {pct}%</span>
          <span>I might be wrong</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-amber-100">
          <div className="h-2 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {showWhy && (
        <ul className="mt-3 list-disc pl-5 text-slate-700">
          {hint.reason_codes.map((code) => (
            <li key={code}>{REASON_TEXT[code] ?? code.replace(/_/g, " ")}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary px-4 py-2" onClick={actions.follow}>
          Follow
        </button>
        <button className="btn-ghost px-4 py-2" onClick={actions.ignore}>
          Ignore
        </button>
        <button className="btn-ghost px-4 py-2" onClick={actions.why}>
          Why?
        </button>
        <button className="btn-ghost px-4 py-2" onClick={actions.check}>
          Check
        </button>
      </div>
    </div>
  );
}

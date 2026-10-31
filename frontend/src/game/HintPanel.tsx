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
    <section className="well flex flex-col gap-3" aria-label="Hint">
      <h3 className="text-base">Hint</h3>
      <p className="text-lg font-semibold leading-snug">{hintInWords(hint)}</p>
      <div>
        <div className="flex justify-between text-sm muted">
          <span>Confidence {pct}%</span>
          <span>I might be wrong</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-paper-3" role="presentation">
          <div className="h-2 rounded-full bg-ink-2" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {showWhy && (
        <ul className="list-disc space-y-1 pl-5 text-ink-2">
          {hint.reason_codes.map((code) => (
            <li key={code}>{REASON_TEXT[code] ?? code.replace(/_/g, " ")}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={actions.follow}>
          Follow
        </button>
        <button type="button" className="btn btn-sm" onClick={actions.ignore}>
          Ignore
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={actions.why}>
          Why?
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={actions.check}>
          Check
        </button>
      </div>
    </section>
  );
}

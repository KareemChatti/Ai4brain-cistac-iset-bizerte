// Card tracker: what has been discarded, and what the opponent took. Lets the user verify a hint.

import type { GameState } from "../engine";
import { CardView } from "./Card";

export function CardTracker({ game, onClose }: { game: GameState; onClose: () => void }) {
  const rows: [string, string[]][] = [
    ["Your opponent took from the discard pile", game.taken[1].map((c) => c.id)],
    ["Your opponent discarded", game.discarded[1]],
    ["You discarded", game.discarded[0]],
  ];
  return (
    <section className="well flex flex-col gap-3" role="dialog" aria-label="Card tracker">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base">Card tracker</h3>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {rows.map(([title, ids]) => (
        <div key={title}>
          <p className="text-sm muted">{title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ids.length ? (
              ids.map((id, i) => <CardView key={`${id}-${i}`} id={id} size="xs" />)
            ) : (
              <span className="text-sm muted">Nothing yet</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

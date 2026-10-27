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
    <div className="card" role="dialog" aria-label="Card tracker">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Card tracker</p>
        <button className="btn-ghost px-3 py-1 text-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {rows.map(([title, ids]) => (
        <div key={title} className="mt-3">
          <p className="text-sm text-slate-600">{title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ids.length ? ids.map((id, i) => <CardView key={`${id}-${i}`} id={id} size="xs" />) : <span className="text-sm text-slate-400">nothing yet</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

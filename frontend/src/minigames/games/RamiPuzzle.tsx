// rami_puzzle (reasoning): which discard gets you out fastest? The answer comes from the turn grader.
// Level grows the hand (7 -> 13 cards), adds a joker from level 5, and makes the traps closer.

import { useEffect, useRef, useState } from "react";
import { CardView } from "../../game/Card";
import { sortHand, parseCard, shortId } from "../../engine/cards";
import { isBestDiscard, puzzlePosition } from "../generators";
import type { MiniGameProps } from "../types";

type Position = ReturnType<typeof puzzlePosition>;

export function RamiPuzzle({ level, record, timeUp, rng }: MiniGameProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const start = useRef(0);

  // Build the position off the click handler so the screen stays responsive.
  const load = (lvl: number) => {
    setPosition(null);
    setChosen(null);
    setTimeout(() => {
      setPosition(puzzlePosition(lvl, rng));
      start.current = performance.now();
    }, 20);
  };

  useEffect(() => {
    load(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: string) => {
    if (!position || chosen) return;
    setChosen(id);
    record({
      correct: isBestDiscard(id, position),
      rtMs: performance.now() - start.current,
      extra: { chosen: id, best: position.best, hand_size: position.hand.length },
    });
    setTimeout(() => {
      if (!timeUp) load(level);
    }, 1400);
  };

  if (!position) return <div className="card flex h-64 items-center justify-center text-slate-500">Dealing a new hand…</div>;

  const hand = sortHand(position.hand.map(parseCard)).map((c) => c.id);
  return (
    <div className="card flex flex-col items-center gap-4">
      <p className="text-center text-slate-600">You have opened and drawn. Which card do you discard to go out fastest?</p>
      <div className="flex flex-wrap justify-center gap-2">
        {hand.map((id) => {
          const mark = chosen ? (isBestDiscard(id, position) ? "good" : id === chosen ? "bad" : null) : null;
          return <CardView key={id} id={id} size="md" mark={mark} onClick={() => choose(id)} disabled={!!chosen} />;
        })}
      </div>
      {chosen && (
        <p className="text-lg font-semibold">
          {isBestDiscard(chosen, position) ? "Best choice!" : `The best discard was ${shortId(position.best).replace("T", "10")}.`}
        </p>
      )}
    </div>
  );
}

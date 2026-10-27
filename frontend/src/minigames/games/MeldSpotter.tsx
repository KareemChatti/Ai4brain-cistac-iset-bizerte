// meld_spotter (attention): one valid meld hides in 12 cards. Tap its 3 cards before the timer.
// Level shortens the time (10 s -> 4 s) and adds near-miss decoys.

import { useEffect, useRef, useState } from "react";
import { CardView } from "../../game/Card";
import { meldSpotterHand, spotterSeconds } from "../generators";
import type { MiniGameProps } from "../types";

export function MeldSpotter({ level, record, timeUp, rng }: MiniGameProps) {
  const [hand, setHand] = useState(() => meldSpotterHand(level, rng));
  const [selected, setSelected] = useState<string[]>([]);
  const [reveal, setReveal] = useState(false);
  const [left, setLeft] = useState(spotterSeconds(level));
  const start = useRef(performance.now());
  const seconds = useRef(spotterSeconds(level));

  const submit = (chosen: string[]) => {
    if (reveal) return;
    const hits = chosen.filter((id) => hand.meld.includes(id)).length;
    const falseAlarms = chosen.length - hits;
    setReveal(true);
    record({
      correct: hits === 3 && falseAlarms === 0,
      rtMs: performance.now() - start.current,
      extra: { hits, targets: 3, false_alarms: falseAlarms, decoys: hand.cards.length - 3 },
    });
  };

  // Per-hand timer.
  useEffect(() => {
    if (reveal) return;
    const id = setInterval(() => {
      const remaining = seconds.current - (performance.now() - start.current) / 1000;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) submit(selected);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, selected, hand]);

  // Next hand after the answer is shown.
  useEffect(() => {
    if (!reveal) return;
    const id = setTimeout(() => {
      if (timeUp) return;
      setHand(meldSpotterHand(level, rng));
      setSelected([]);
      setReveal(false);
      seconds.current = spotterSeconds(level);
      setLeft(seconds.current);
      start.current = performance.now();
    }, 1100);
    return () => clearTimeout(id);
  }, [reveal, timeUp, level, rng]);

  const toggle = (id: string) => {
    if (reveal) return;
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    if (next.length === 3) submit(next);
  };

  return (
    <div className="card flex flex-col items-center gap-4">
      <p className="text-slate-600">Find the one valid set or run. {reveal ? "" : `${left.toFixed(1)} s`}</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {hand.cards.map((id) => {
          const inMeld = hand.meld.includes(id);
          const mark = reveal ? (inMeld ? "good" : selected.includes(id) ? "bad" : null) : null;
          return <CardView key={id} id={id} size="md" selected={!reveal && selected.includes(id)} mark={mark} onClick={() => toggle(id)} disabled={reveal} />;
        })}
      </div>
    </div>
  );
}

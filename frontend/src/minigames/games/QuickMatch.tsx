// quick_match (speed): a meld and one card. Does the card fit? Answer as fast as you can.
// 45 seconds; higher levels use more look-alike cards. Keys: F = fits, J = doesn't fit.

import { useCallback, useEffect, useRef, useState } from "react";
import { CardView } from "../../game/Card";
import { quickMatchTrial } from "../generators";
import type { MiniGameProps } from "../types";

export function QuickMatch({ level, record, finish, timeUp, rng }: MiniGameProps) {
  const [trial, setTrial] = useState(() => quickMatchTrial(level, rng));
  const [flash, setFlash] = useState<boolean | null>(null);
  const start = useRef(performance.now());

  useEffect(() => {
    if (timeUp) finish();
  }, [timeUp, finish]);

  const answer = useCallback(
    (saysFits: boolean) => {
      if (flash !== null || timeUp) return;
      const correct = saysFits === trial.fits;
      record({ correct, rtMs: performance.now() - start.current, extra: { fits: trial.fits } });
      setFlash(correct);
      setTimeout(() => {
        setTrial(quickMatchTrial(level, rng));
        setFlash(null);
        start.current = performance.now();
      }, 250);
    },
    [flash, timeUp, trial, record, level, rng],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "ArrowLeft") answer(true);
      if (e.key === "j" || e.key === "ArrowRight") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  return (
    <div className={`card flex flex-col items-center gap-5 transition-colors ${flash === true ? "bg-emerald-50" : flash === false ? "bg-rose-50" : ""}`}>
      <p className="text-slate-600">Can this card be added to the meld?</p>
      <div className="flex items-center gap-6">
        <div className="flex -space-x-4">
          {trial.meld.map((id) => (
            <CardView key={id} id={id} size="md" />
          ))}
        </div>
        <span className="text-3xl text-slate-400">+</span>
        <CardView id={trial.card} size="lg" />
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <button className="btn-primary py-4 text-lg" onClick={() => answer(true)}>
          Fits <span className="hidden text-sm opacity-70 sm:inline">(F)</span>
        </button>
        <button className="btn-ghost py-4 text-lg" onClick={() => answer(false)}>
          Doesn't fit <span className="hidden text-sm opacity-70 sm:inline">(J)</span>
        </button>
      </div>
    </div>
  );
}

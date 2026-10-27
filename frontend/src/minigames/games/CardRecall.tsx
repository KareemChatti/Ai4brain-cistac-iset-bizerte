// card_recall (memory): cards flash one by one, then the player rebuilds the order.
// Level = sequence length, 3 to 9.

import { useEffect, useRef, useState } from "react";
import { CardView } from "../../game/Card";
import { shuffle } from "../../engine/cards";
import { recallSequence } from "../generators";
import type { MiniGameProps } from "../types";

type Phase = "show" | "recall" | "feedback";

export function CardRecall({ level, record, timeUp, rng }: MiniGameProps) {
  const [sequence, setSequence] = useState<string[]>(() => recallSequence(level, rng));
  const [phase, setPhase] = useState<Phase>("show");
  const [shown, setShown] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [ok, setOk] = useState<boolean | null>(null);
  const recallStart = useRef(0);

  // Flash the cards, one per second.
  useEffect(() => {
    if (phase !== "show") return;
    if (shown >= sequence.length) {
      setPalette(shuffle(sequence, rng));
      recallStart.current = performance.now();
      setPhase("recall");
      return;
    }
    const id = setTimeout(() => setShown((n) => n + 1), 1000);
    return () => clearTimeout(id);
  }, [phase, shown, sequence, rng]);

  const next = () => {
    if (timeUp) return;
    setSequence(recallSequence(level, rng));
    setShown(0);
    setPicked([]);
    setOk(null);
    setPhase("show");
  };

  const choose = (id: string) => {
    if (phase !== "recall" || picked.includes(id)) return;
    const now = [...picked, id];
    setPicked(now);
    const wrong = sequence[now.length - 1] !== id;
    if (wrong || now.length === sequence.length) {
      const correct = !wrong;
      setOk(correct);
      setPhase("feedback");
      record({ correct, rtMs: performance.now() - recallStart.current, extra: { span: sequence.length } });
    }
  };

  useEffect(() => {
    if (phase !== "feedback") return;
    const id = setTimeout(next, 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="card flex min-h-[20rem] flex-col items-center gap-5">
      {phase === "show" && (
        <>
          <p className="text-slate-600">
            Remember the order · card {Math.min(shown + 1, sequence.length)} of {sequence.length}
          </p>
          {shown < sequence.length && <CardView key={`${shown}-${sequence[shown]}`} id={sequence[shown]} size="lg" />}
        </>
      )}
      {phase !== "show" && (
        <>
          <p className="text-slate-600">Tap the cards in the order you saw them.</p>
          <div className="flex min-h-[4rem] flex-wrap justify-center gap-2" aria-label="Your order">
            {picked.map((id, i) => (
              <CardView key={id} id={id} size="sm" mark={phase === "feedback" ? (sequence[i] === id ? "good" : "bad") : null} />
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {palette.map((id) => (
              <CardView key={id} id={id} size="md" onClick={() => choose(id)} disabled={picked.includes(id) || phase !== "recall"} className={picked.includes(id) ? "opacity-30" : ""} />
            ))}
          </div>
          {ok !== null && <p className={`text-lg font-semibold ${ok ? "text-emerald-700" : "text-slate-700"}`}>{ok ? "Correct!" : "Not quite."}</p>}
        </>
      )}
    </div>
  );
}

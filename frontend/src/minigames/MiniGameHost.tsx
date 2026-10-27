// Runs any registered mini-game: instructions, a 3-2-1 countdown, the timed game, then a summary.
// Logs a `trial` event per answer and `minigame_end` at the end (docs/contracts.md section 4).

import { useEffect, useMemo, useRef, useState } from "react";
import type { MiniGameId, MiniGameResult } from "@shared/types";
import { mulberry32 } from "../engine/cards";
import { flush, logEvent, setLogContext } from "../game/logger";
import { MINIGAMES } from "./registry";
import type { TrialResult } from "./types";
import { useStaircase } from "./useStaircase";

export type MiniGameHostProps = {
  gameId: MiniGameId;
  level: number;
  userId: string;
  sessionId: string;
  onDone: (result: MiniGameResult) => void;
};

type Phase = "intro" | "countdown" | "playing" | "done";

export function MiniGameHost({ gameId, level, userId, sessionId, onDone }: MiniGameHostProps) {
  setLogContext(userId, sessionId);
  const def = MINIGAMES[gameId];
  const startLevel = Math.min(def?.maxLevel ?? 1, Math.max(def?.minLevel ?? 1, Math.round(level) || 1));
  const staircase = useStaircase(startLevel, def?.minLevel ?? 1, def?.maxLevel ?? 1);
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [timeLeft, setTimeLeft] = useState(def?.durationMs ?? 0);
  const trials = useRef<(TrialResult & { level: number })[]>([]);
  const deadline = useRef(0);
  const finished = useRef(false);
  const rng = useMemo(() => mulberry32(Date.now() & 0x7fffffff), []);

  // Countdown, then the game clock.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      deadline.current = performance.now() + def.durationMs;
      setPhase("playing");
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count, def]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setTimeLeft(Math.max(0, deadline.current - performance.now())), 200);
    return () => clearInterval(id);
  }, [phase]);

  const timeUp = phase === "playing" && timeLeft <= 0;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const list = trials.current;
    const correct = list.filter((t) => t.correct).length;
    const accuracy = list.length ? Math.round((correct / list.length) * 100) / 100 : 0;
    const levelEnd = staircase.current();
    logEvent("minigame", "minigame_end", {
      game: def.id,
      dimension: def.dimension,
      level_start: startLevel,
      level_end: levelEnd,
      n_trials: list.length,
      accuracy,
      score_raw: Math.round(def.scoreRaw(list) * 100) / 100,
    });
    void flush();
    setPhase("done");
  };

  // Out of time and no trial pending: wrap up after a short grace period for the trial on screen.
  useEffect(() => {
    if (!timeUp) return;
    const id = setTimeout(finish, 15_000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const record = (result: TrialResult) => {
    if (finished.current) return;
    const levelNow = staircase.current();
    trials.current.push({ ...result, level: levelNow });
    logEvent("minigame", "trial", {
      game: def.id,
      dimension: def.dimension,
      level: levelNow,
      correct: result.correct,
      rt_ms: Math.round(result.rtMs),
      extra: result.extra ?? {},
    });
    staircase.update(result.correct);
    if (deadline.current && performance.now() >= deadline.current) finish();
  };

  if (!def) return <p className="card">Unknown mini-game: {gameId}</p>;

  if (phase === "intro") {
    return (
      <div className="card mx-auto max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">{def.dimension}</p>
        <h2 className="mt-1 text-2xl font-bold">{def.title}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
          {def.instructions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          About {Math.round(def.durationMs / 1000)} seconds · starts at level {startLevel} · gets harder as you succeed.
        </p>
        <button className="btn-primary mt-5 w-full" onClick={() => setPhase("countdown")}>
          Start
        </button>
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="card mx-auto flex h-64 max-w-xl items-center justify-center">
        <span className="text-7xl font-bold text-brand" aria-live="assertive">
          {count || "Go!"}
        </span>
      </div>
    );
  }

  if (phase === "done") {
    const list = trials.current;
    const correct = list.filter((t) => t.correct).length;
    const result: MiniGameResult = {
      game: def.id as MiniGameId,
      level_end: staircase.current(),
      accuracy: list.length ? correct / list.length : 0,
      n_trials: list.length,
    };
    return (
      <div className="card mx-auto max-w-xl text-center">
        <h2 className="text-2xl font-bold">Well done</h2>
        <p className="mt-2 text-slate-700">
          {correct} of {list.length} correct · level {startLevel} → {result.level_end}
        </p>
        <button className="btn-primary mt-5" onClick={() => onDone(result)}>
          Continue
        </button>
      </div>
    );
  }

  const Game = def.Component;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
        <span>Level {staircase.level}</span>
        <span>{timeUp ? "Last one!" : `${Math.ceil(timeLeft / 1000)} s`}</span>
      </div>
      <div className="mb-4 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${(timeLeft / def.durationMs) * 100}%` }} />
      </div>
      <Game level={staircase.level} record={record} finish={finish} timeUp={timeUp} rng={rng} />
    </div>
  );
}

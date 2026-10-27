// rule_switch (flexibility), Wisconsin-card-sorting style: does the card go with the reference card?
// A hidden rule decides (same colour, same rank, next in suit, same suit). After 6 correct in a row the
// rule changes silently. We record how many trials the player needs to adapt, and how many errors
// still follow the old rule (perseverative errors).

import { useEffect, useRef, useState } from "react";
import { CardView } from "../../game/Card";
import { RULES_BY_LEVEL, SortRule, fitsRule, ruleSwitchTrial } from "../generators";
import type { MiniGameProps } from "../types";

const SWITCH_AFTER = 6;
const ADAPTED_AFTER = 3;

export function RuleSwitch({ level, record, finish, timeUp, rng }: MiniGameProps) {
  const rules = RULES_BY_LEVEL(level);
  const [rule, setRule] = useState<SortRule>(() => rules[Math.floor(rng() * rules.length)]);
  const [trial, setTrial] = useState(() => ruleSwitchTrial(rule, rng));
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const start = useRef(performance.now());
  const streak = useRef(0);
  // After a switch: trials since the switch, the old rule, and errors that followed it.
  const adapting = useRef<{ since: number; oldRule: SortRule; perseverative: number } | null>(null);

  useEffect(() => {
    if (timeUp && feedback === null) finish();
  }, [timeUp, feedback, finish]);

  const answer = (saysFits: boolean) => {
    if (feedback !== null) return;
    const correct = saysFits === trial.fits;
    const extra: Record<string, unknown> = { rule };
    const a = adapting.current;
    if (a) {
      a.since += 1;
      if (!correct && saysFits === fitsRule(a.oldRule, trial.reference, trial.card)) a.perseverative += 1;
    }
    streak.current = correct ? streak.current + 1 : 0;
    if (a && streak.current >= ADAPTED_AFTER) {
      // Adapted: trials spent before this run of correct answers began.
      extra.trials_to_adapt = a.since - ADAPTED_AFTER;
      extra.perseverative_errors = a.perseverative;
      adapting.current = null;
    }
    record({ correct, rtMs: performance.now() - start.current, extra });
    setFeedback(correct);

    let nextRule = rule;
    if (!adapting.current && streak.current >= SWITCH_AFTER) {
      const others = RULES_BY_LEVEL(level).filter((r) => r !== rule);
      nextRule = others[Math.floor(rng() * others.length)];
      adapting.current = { since: 0, oldRule: rule, perseverative: 0 };
      streak.current = 0;
    }
    setTimeout(() => {
      setRule(nextRule);
      setTrial(ruleSwitchTrial(nextRule, rng));
      setFeedback(null);
      start.current = performance.now();
    }, 600);
  };

  return (
    <div className={`card flex flex-col items-center gap-5 ${feedback === true ? "bg-emerald-50" : feedback === false ? "bg-rose-50" : ""}`}>
      <p className="text-center text-slate-600">Does the card go with the reference card? Find the hidden rule from the feedback.</p>
      <div className="flex items-end gap-8">
        <div className="flex flex-col items-center gap-1">
          <CardView id={trial.reference} size="lg" />
          <span className="text-sm text-slate-500">reference</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <CardView id={trial.card} size="lg" />
          <span className="text-sm text-slate-500">your card</span>
        </div>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <button className="btn-primary py-4 text-lg" onClick={() => answer(true)}>
          Goes with it
        </button>
        <button className="btn-ghost py-4 text-lg" onClick={() => answer(false)}>
          Doesn't
        </button>
      </div>
      <p className="h-6 text-lg font-semibold" aria-live="polite">
        {feedback === null ? "" : feedback ? "Correct" : "Wrong"}
      </p>
    </div>
  );
}

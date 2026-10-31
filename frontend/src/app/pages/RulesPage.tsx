import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_RULES, MATCH_TARGETS, QUICK_RULES, useMatch } from "@/game";
import type { RamiRules } from "@/game";
import { PageTitle } from "../ui";

type NumberKey = "decks" | "jokers" | "handSize" | "openingMin" | "jokerPenalty" | "neverOpenedPenalty" | "opponentLevel";
type BoolKey = "discardMustBeUsed" | "jokerSwap" | "aceHigh" | "mustDiscardToGoOut" | "hintsEnabled" | "liveCoach";

const NUMBERS: { key: NumberKey; label: string; min: number; max: number }[] = [
  { key: "decks", label: "Decks of 52 cards", min: 1, max: 2 },
  { key: "jokers", label: "Jokers", min: 0, max: 4 },
  { key: "handSize", label: "Cards dealt to each player (the first player gets one more)", min: 7, max: 14 },
  { key: "openingMin", label: "Points needed to open", min: 0, max: 120 },
  { key: "jokerPenalty", label: "Penalty for a joker left in hand", min: 0, max: 100 },
  { key: "neverOpenedPenalty", label: "Penalty if you never opened", min: 0, max: 200 },
  { key: "opponentLevel", label: "Opponent level (1 to 5)", min: 1, max: 5 },
];

const SWITCHES: { key: BoolKey; label: string }[] = [
  { key: "discardMustBeUsed", label: "You may take the top discard only if you lay it down in the same turn" },
  { key: "jokerSwap", label: "Joker swap: place the real card and take the joker from the table" },
  { key: "aceHigh", label: "Ace can end a run high (Q-K-A). A run never wraps (K-A-2)." },
  { key: "mustDiscardToGoOut", label: "You must go out with a final discard" },
  { key: "hintsEnabled", label: "Hint button" },
  { key: "liveCoach", label: "Live coach: warns you during your turn (missed lay-off, joker swap, opening, feeding the opponent)" },
];

export default function RulesPage() {
  const { rules, setRules, match, newMatch } = useMatch();
  const [draft, setDraft] = useState<RamiRules>(rules);
  const navigate = useNavigate();
  const matchRunning = !!match && !match.winner && match.rounds.length > 0;

  const num = (key: NumberKey, value: string, min: number, max: number) => {
    const n = Math.round(Number(value));
    if (Number.isFinite(n)) setDraft({ ...draft, [key]: Math.min(max, Math.max(min, n)) });
  };

  const save = (startNew: boolean) => {
    setRules(draft);
    if (startNew || !matchRunning) newMatch();
    navigate("/play");
  };

  return (
    <>
      <PageTitle sub="House rules differ between families and cafés. Pick yours; they are saved on this device.">Rules</PageTitle>

      <section className="card">
        <h2 className="font-semibold">Game length</h2>
        <p className="mt-1 text-sm text-muted">Penalty points add up over rounds. The first player to reach the target loses.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MATCH_TARGETS.map((t) => (
            <button
              key={String(t)}
              className={draft.matchTarget === t ? "btn btn-primary" : "btn"}
              onClick={() => setDraft({ ...draft, matchTarget: t })}
            >
              {t ?? "Single round"}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="font-semibold">Deck</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button className="btn h-auto flex-col items-start whitespace-normal py-3 text-left" onClick={() => setDraft({ ...DEFAULT_RULES, matchTarget: draft.matchTarget })}>
            <span>Standard</span>
            <span className="text-sm font-medium text-ink-2">2 decks + 4 jokers, 14 cards, open at 71</span>
          </button>
          <button className="btn h-auto flex-col items-start whitespace-normal py-3 text-left" onClick={() => setDraft({ ...QUICK_RULES, matchTarget: draft.matchTarget })}>
            <span>Quick</span>
            <span className="text-sm font-medium text-ink-2">1 deck + 2 jokers, 10 cards, open at 40</span>
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {NUMBERS.map(({ key, label, min, max }) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl bg-paper-2 px-3 py-2">
              <span className="text-sm">{label}</span>
              <input
                type="number"
                className="w-20 rounded-lg border border-muted bg-card px-2 py-1 text-right"
                min={min}
                max={max}
                value={draft[key]}
                onChange={(e) => num(key, e.target.value, min, max)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="font-semibold">Play</h2>
        <div className="mt-3 space-y-2">
          {SWITCHES.map(({ key, label }) => (
            <label key={key} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">At most one joker per meld (fixed for now).</p>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {matchRunning ? (
          <>
            <button className="btn btn-primary" onClick={() => save(false)}>
              Save, keep the current match score
            </button>
            <button className="btn" onClick={() => save(true)}>
              Save and start a new match
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => save(true)}>
            Save and play
          </button>
        )}
      </div>
    </>
  );
}

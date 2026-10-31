import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RoundSummary } from "@shared/types";
import { gameConfigOf, useMatch } from "@/game";
import { useApp } from "../store";
import { usePlanRun } from "../planRun";
import { RamiTable } from "../slots";
import { PageTitle } from "../ui";

export function MatchScore() {
  const { match, rules } = useMatch();
  if (!rules.matchTarget) return null;
  const totals = match?.totals ?? [0, 0];
  const target = match?.target ?? rules.matchTarget;
  const round = (match?.rounds.length ?? 0) + (match?.winner ? 0 : 1);
  return (
    <section className="flex flex-wrap items-end gap-x-8 gap-y-2" aria-label="Match score">
      <div>
        <p className="font-semibold">Match to {target}</p>
        <p className="text-sm muted">Round {round}</p>
        <p className="text-sm muted">The first to reach {target} penalty points loses</p>
      </div>
      <dl className="flex gap-6">
        <div>
          <dt className="text-sm muted">You</dt>
          <dd className="figure text-3xl text-ink sm:text-figure">{totals[0]}</dd>
        </div>
        <div className="border-l border-rule pl-6">
          <dt className="text-sm muted">Opponent</dt>
          <dd className="figure text-3xl text-ink-2 sm:text-figure">{totals[1]}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function PlayPage() {
  const { userId, sessionId } = useApp();
  const { index, opponentLevel } = usePlanRun();
  const { rules, match, recordRound, newMatch } = useMatch();
  const navigate = useNavigate();
  const [table, setTable] = useState(0);
  const inPlan = index >= 0;

  const onRoundEnd = (summary: RoundSummary) => {
    navigate(`/review/${summary.round_id}`);
  };

  if (match?.winner) {
    return (
      <>
        <PageTitle>Match over</PageTitle>
        <section className="card flex flex-col gap-4">
          <h2>{match.winner === "user" ? "You won the match!" : "Your opponent won the match."}</h2>
          <MatchScore />
          <p className="muted">
            {match.rounds.length} rounds, you {match.totals[0]}, opponent {match.totals[1]} (target {match.target})
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                newMatch();
                setTable((n) => n + 1);
              }}
            >
              New match
            </button>
            <Link className="btn no-underline" to="/rules">
              Change the rules
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-3 sm:mb-6">
        <header className="flex flex-col gap-1 sm:gap-2">
          <h1 className="text-2xl sm:text-page">Play Rami</h1>
          <p className="max-w-[52ch] text-ink-2">
            Make melds, watch the discards, and ask for a hint when you want one.{" "}
            <Link to="/rules">Rules</Link>
          </p>
        </header>
        <MatchScore />
      </div>
      <RamiTable
        key={table}
        userId={userId!}
        sessionId={sessionId}
        opponentLevel={inPlan ? opponentLevel : rules.opponentLevel}
        quickMode={rules.decks === 1}
        config={gameConfigOf(rules)}
        hintsEnabled={rules.hintsEnabled}
        liveCoach={rules.liveCoach}
        onRoundScored={recordRound}
        matchId={() => useMatch.getState().ensureMatch()}
        onRoundEnd={onRoundEnd}
      />
    </>
  );
}

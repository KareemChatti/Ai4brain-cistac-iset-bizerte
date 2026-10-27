import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RoundSummary } from "@shared/types";
import { gameConfigOf, useMatch } from "@/game";
import { useApp } from "../store";
import { usePlanRun } from "../planRun";
import { RamiTable } from "../slots";
import { PageTitle } from "../ui";

/** Running total against the target: the first to reach it loses. */
export function MatchScore() {
  const { match, rules } = useMatch();
  if (!rules.matchTarget) return null;
  const totals = match?.totals ?? [0, 0];
  const target = match?.target ?? rules.matchTarget;
  return (
    <section className="card mb-4 flex flex-wrap items-center justify-between gap-3 py-3" aria-label="Match score">
      <div>
        <p className="font-semibold">Match to {target}</p>
        <p className="text-sm text-slate-600">
          Round {(match?.rounds.length ?? 0) + (match?.winner ? 0 : 1)} · the first to reach {target} penalty points loses
        </p>
      </div>
      <div className="flex gap-6 text-center">
        <div>
          <p className="text-sm text-slate-500">You</p>
          <p className="text-2xl font-bold text-brand">{totals[0]}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Opponent</p>
          <p className="text-2xl font-bold text-slate-700">{totals[1]}</p>
        </div>
      </div>
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
    // The review comes right after a round; it offers the next round of the match.
    navigate(`/review/${summary.round_id}`);
  };

  if (match?.winner) {
    return (
      <>
        <PageTitle>Match over</PageTitle>
        <MatchScore />
        <section className="card text-center">
          <p className="text-xl font-bold">{match.winner === "user" ? "You won the match!" : "Your opponent won the match."}</p>
          <p className="mt-1 text-slate-600">
            {match.rounds.length} rounds · you {match.totals[0]}, opponent {match.totals[1]} (target {match.target})
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                newMatch();
                setTable((n) => n + 1);
              }}
            >
              New match
            </button>
            <Link className="btn-ghost" to="/rules">
              Change the rules
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageTitle
        sub={
          <>
            Make melds, watch the discards, and ask for a hint when you want one.{" "}
            <Link className="underline" to="/rules">
              Rules
            </Link>
          </>
        }
      >
        Play Rami
      </PageTitle>
      <MatchScore />
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
        onRoundEnd={onRoundEnd}
      />
    </>
  );
}

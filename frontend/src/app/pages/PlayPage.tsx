import { useNavigate } from "react-router-dom";
import type { RoundSummary } from "@shared/types";
import { useApp } from "../store";
import { usePlanRun } from "../planRun";
import { RamiTable } from "../slots";
import { PageTitle } from "../ui";

export default function PlayPage() {
  const { userId, sessionId } = useApp();
  const { index, opponentLevel, quickMode } = usePlanRun();
  const navigate = useNavigate();
  const inPlan = index >= 0;

  const onRoundEnd = (summary: RoundSummary) => {
    // The review comes right after a round; it offers to continue the plan.
    navigate(`/review/${summary.round_id}`);
  };

  return (
    <>
      <PageTitle sub="Make melds, watch the discards, and ask for a hint when you want one.">Play Rami</PageTitle>
      <RamiTable
        userId={userId!}
        sessionId={sessionId}
        opponentLevel={inPlan ? opponentLevel : 3}
        quickMode={inPlan ? quickMode : false}
        hintsEnabled
        onRoundEnd={onRoundEnd}
      />
    </>
  );
}

import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { MiniGameId } from "@shared/types";
import { useApp } from "../store";
import { nextStepPath, usePlanRun } from "../planRun";
import { MiniGameHost } from "../slots";
import { GAME_LABELS, PageTitle } from "../ui";

const GAMES: { id: MiniGameId; skill: string }[] = [
  { id: "card_recall", skill: "Memory" },
  { id: "meld_spotter", skill: "Attention" },
  { id: "quick_match", skill: "Speed" },
  { id: "rami_puzzle", skill: "Reasoning" },
  { id: "rule_switch", skill: "Flexibility" },
];

export function TrainIndex() {
  return (
    <>
      <PageTitle sub="Five short games, one skill each.">Train</PageTitle>
      <ul className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <li key={g.id}>
            <Link to={`/train/${g.id}`} className="card block hover:border-brand">
              <p className="text-lg font-semibold text-brand">{GAME_LABELS[g.id]}</p>
              <p className="text-slate-600">{g.skill}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function TrainPage() {
  const { gameId = "card_recall" } = useParams();
  const [search] = useSearchParams();
  const level = Number(search.get("level") ?? 1);
  const { userId, sessionId } = useApp();
  const inPlan = usePlanRun((s) => s.index >= 0);
  const navigate = useNavigate();

  const onDone = () => {
    if (!inPlan) return navigate("/train");
    navigate(nextStepPath() ?? "/dashboard");
  };

  return (
    <>
      <PageTitle>{GAME_LABELS[gameId] ?? gameId}</PageTitle>
      <MiniGameHost
        key={`${gameId}-${level}`}
        gameId={gameId as MiniGameId}
        level={level}
        userId={userId!}
        sessionId={sessionId}
        onDone={onDone}
      />
    </>
  );
}

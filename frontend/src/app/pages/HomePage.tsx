import { useNavigate } from "react-router-dom";
import { getPlan } from "@/api/client";
import { useApp } from "../store";
import { useAsync } from "../useAsync";
import { usePlanRun, stepPath } from "../planRun";
import { DIMENSION_LABELS, ErrorNote, GAME_LABELS, Loading, PageTitle } from "../ui";

export default function HomePage() {
  const userId = useApp((s) => s.userId)!;
  const { data: plan, error, loading } = useAsync(() => getPlan(userId), [userId]);
  const start = usePlanRun((s) => s.start);
  const navigate = useNavigate();

  return (
    <>
      <PageTitle sub="A short session picked for you. It takes about 10 minutes.">Today's plan</PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {plan && (
        <section className="card">
          <p className="text-sm uppercase tracking-wide text-slate-500">Focus</p>
          <p className="text-xl font-semibold text-brand">{DIMENSION_LABELS[plan.focus]}</p>
          <p className="mt-2 text-slate-700">{plan.reason}</p>
          <ol className="mt-5 space-y-2">
            {plan.steps.map((step, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                  {i + 1}
                </span>
                {step.kind === "rami" ? (
                  <span>
                    Rami round against level {plan.opponent_level}
                    {plan.quick_mode ? " (quick round)" : ""}
                  </span>
                ) : (
                  <span>
                    {GAME_LABELS[step.game ?? ""] ?? step.game}
                    {step.level ? `, level ${step.level}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <button
            className="btn-primary mt-6 w-full sm:w-auto"
            onClick={() => {
              start(plan.steps, plan.opponent_level, plan.quick_mode);
              if (plan.steps[0]) navigate(stepPath(plan.steps[0]));
            }}
          >
            Start
          </button>
        </section>
      )}
    </>
  );
}

import { useNavigate } from "react-router-dom";
import { getPlan } from "@/api/client";
import { useApp } from "../store";
import { useAsync } from "../useAsync";
import { usePlanRun, ramiSteps, stepPath } from "../planRun";
import { DIMENSION_LABELS, ErrorNote, Loading, PageTitle } from "../ui";

export default function HomePage() {
  const userId = useApp((s) => s.userId)!;
  const { data: plan, error, loading } = useAsync(() => getPlan(userId), [userId]);
  const start = usePlanRun((s) => s.start);
  const navigate = useNavigate();
  const steps = plan ? ramiSteps(plan.steps) : [];
  if (plan && !steps.length) steps.push({ kind: "rami" });

  return (
    <>
      <PageTitle sub="A Rami session picked for you, with the coach watching your decisions.">Today’s plan</PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {plan && (
        <section className="card">
          <p className="text-sm text-muted">Focus</p>
          <p className="text-xl font-semibold text-ink">{DIMENSION_LABELS[plan.focus]}</p>
          <p className="mt-2 text-ink-2">{plan.reason}</p>
          <ol className="mt-5 space-y-2">
            {steps.map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-paper-2 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-paper">
                  {i + 1}
                </span>
                <span>Rami round against level {plan.opponent_level}</span>
              </li>
            ))}
          </ol>
          <button
            className="btn btn-primary mt-6 w-full sm:w-auto"
            onClick={() => {
              start(steps, plan.opponent_level, plan.quick_mode);
              navigate(stepPath(steps[0]));
            }}
          >
            Start
          </button>
        </section>
      )}
    </>
  );
}

// First version for task 3.1. Task 3.3 adds the evidence toggle, retry, hint reveal and voice.
import { useNavigate, useParams } from "react-router-dom";
import { getReview } from "@/api/client";
import { useApp } from "@/app/store";
import { useAsync } from "@/app/useAsync";
import { nextStepPath, usePlanRun } from "@/app/planRun";
import { DIMENSION_LABELS, ErrorNote, Loading, PageTitle } from "@/app/ui";

export default function ReviewPage() {
  const { roundId = "" } = useParams();
  const userId = useApp((s) => s.userId)!;
  const inPlan = usePlanRun((s) => s.index >= 0);
  const navigate = useNavigate();
  const { data: review, error, loading } = useAsync(() => getReview(userId, roundId), [userId, roundId]);

  return (
    <>
      <PageTitle sub="What happened in your round, based only on what was recorded.">Round review</PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {review && (
        <div className="space-y-4">
          <p className="text-xl font-semibold">{review.headline}</p>
          {review.key_moments.map((m, i) => (
            <article key={i} className="card">
              <p className="text-sm text-slate-500">Turn {m.turn_no}</p>
              <h2 className="text-lg font-semibold text-brand">{m.title}</h2>
              <p className="mt-1">{m.explanation}</p>
              <p className="mt-2 rounded-lg bg-brand-light px-3 py-2">Tip: {m.tip}</p>
            </article>
          ))}
          {review.strengths.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">What went well</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {review.strengths.map((s, i) => (
                  <li key={i}>{s.text}</li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h2 className="font-semibold">Next focus: {DIMENSION_LABELS[review.next_focus.dimension]}</h2>
            <p className="mt-1">{review.next_focus.text}</p>
          </section>
          {inPlan && (
            <button className="btn-primary" onClick={() => navigate(nextStepPath() ?? "/dashboard")}>
              Continue today's plan
            </button>
          )}
        </div>
      )}
    </>
  );
}

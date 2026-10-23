// First version for task 3.1: the Brain Twin numbers with their ranges. Task 3.4 adds the charts.
import { DIMENSIONS } from "@shared/types";
import { getProfile } from "@/api/client";
import { useApp } from "@/app/store";
import { useAsync } from "@/app/useAsync";
import { DIMENSION_LABELS, ErrorNote, Loading, PageTitle } from "@/app/ui";

export default function DashboardPage() {
  const userId = useApp((s) => s.userId)!;
  const { data: profile, error, loading } = useAsync(() => getProfile(userId), [userId]);

  return (
    <>
      <PageTitle sub="Each score comes with a range: the narrower it is, the surer we are.">Your Brain Twin</PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {profile && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {DIMENSIONS.map((d) => {
            const e = profile.dimensions[d];
            const spread = Math.round((e.high - e.low) / 2);
            return (
              <li key={d} className="card">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{DIMENSION_LABELS[d]}</span>
                  <span className="text-sm text-slate-500">
                    {e.trend > 0 ? "▲" : e.trend < 0 ? "▼" : "■"} {Math.abs(e.trend).toFixed(1)} this week
                  </span>
                </div>
                {e.n_obs < 5 ? (
                  <p className="mt-2 text-slate-500">Still learning about you</p>
                ) : (
                  <p className="mt-1 text-2xl font-bold text-brand">
                    {Math.round(e.score)}% <span className="text-base font-normal text-slate-500">± {spread}</span>
                  </p>
                )}
                <div className="relative mt-3 h-3 rounded-full bg-slate-100" aria-hidden>
                  <div
                    className="absolute h-3 rounded-full bg-brand/30"
                    style={{ left: `${e.low}%`, width: `${e.high - e.low}%` }}
                  />
                  <div className="absolute h-3 w-1 rounded bg-brand" style={{ left: `${e.score}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

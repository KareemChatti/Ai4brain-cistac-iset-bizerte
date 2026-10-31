// The Brain Twin dashboard (task 3.4): every score with its range, the trend over time, a what-if
// projection (always with its disclaimer), the match history and the AI Collaboration Score.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DIMENSIONS } from "@shared/types";
import type { CollabComponent, CollabScore, DimensionKey, MatchSummary, Profile, Projection, Snapshot } from "@shared/types";
import { getCollab, getHistory, getMatches, getProfile, getProjection } from "@/api/client";
import { useApp } from "@/app/store";
import { useAsync } from "@/app/useAsync";
import { DIMENSION_LABELS, ErrorNote, Loading, PageTitle } from "@/app/ui";

/** Chart colours come from the design tokens (src/tokens.css); SVG attributes cannot read var() themselves. */
function useChartColours() {
  return useMemo(() => {
    const css = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
    const read = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
    return {
      score: read("--color-accent-2", "currentColor"),
      band: read("--color-mat-2", "currentColor"),
      inner: read("--color-card", "transparent"),
      grid: read("--color-rule", "currentColor"),
      ink: read("--color-muted", "currentColor"),
    };
  }, []);
}

const COLLAB_LABELS: Record<CollabComponent, { title: string; meaning: string; unit: string }> = {
  clarification: { title: "Clarification", meaning: "You asked “Why?” before acting on a hint.", unit: "hints" },
  verification: { title: "Verification", meaning: "You followed good advice and set weak advice aside.", unit: "decisions" },
  iteration: { title: "Iteration", meaning: "You went back to reviews and positions to learn.", unit: "rounds" },
  autonomy: { title: "Autonomy", meaning: "You played turns on your own, without asking.", unit: "turns" },
  responsible_use: { title: "Responsible use", meaning: "You tried first and kept personal details out of the chat.", unit: "requests" },
};

const spread = (low: number, high: number) => Math.round((high - low) / 2);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function DashboardPage() {
  const userId = useApp((s) => s.userId)!;
  const profile = useAsync(() => getProfile(userId), [userId]);
  const history = useAsync(() => getHistory(userId), [userId]);
  const matches = useAsync(() => getMatches(userId), [userId]);
  const collab = useAsync(() => getCollab(userId), [userId]);

  return (
    <>
      <PageTitle sub="Each score comes with a range: the narrower it is, the surer we are.">Your Brain Twin</PageTitle>
      {profile.loading && <Loading />}
      {profile.error && <ErrorNote error={profile.error} />}
      {profile.data && (
        <div className="flex flex-col gap-6">
          {profile.data.flags.suggest_break && (
            <p className="rounded-stock bg-accent px-5 py-4 font-medium text-accent-ink" role="status">
              You’ve been playing fast and the last moves were tough. A short break often helps.
            </p>
          )}
          {profile.data.n_rounds === 0 ? (
            <EmptyState />
          ) : (
            <>
              <section className="card grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" aria-label="Skills radar">
                <TwinRadar profile={profile.data} />
                <SkillList profile={profile.data} />
              </section>
              <div className="grid gap-6 xl:grid-cols-2">
                {history.data && history.data.length > 1 && <Progress history={history.data} />}
                <ProjectionCard userId={userId} />
              </div>
            </>
          )}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Matches matches={matches.data} />
            {collab.data && <Collab collab={collab.data} />}
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <section className="card flex flex-col items-start gap-2">
      <h2>No rounds yet</h2>
      <p className="text-ink-2">Play a round of Rami and your Brain Twin starts learning about you.</p>
      <Link className="btn btn-primary mt-2 no-underline" to="/play">
        Play a round
      </Link>
    </section>
  );
}

function TwinRadar({ profile }: { profile: Profile }) {
  const c = useChartColours();
  const data = DIMENSIONS.map((d) => ({ dimension: DIMENSION_LABELS[d], ...profile.dimensions[d] }));
  return (
    <div className="min-w-0">
      <h2>Your five skills</h2>
      <p className="mt-1 text-sm muted">The dark shape is your score; the light band is the range we are sure of.</p>
      <div className="mt-2 h-72 w-full" role="img" aria-label="Radar chart of the five skill scores with their ranges">
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="68%" margin={{ top: 8, right: 36, bottom: 8, left: 36 }}>
            <PolarGrid stroke={c.grid} />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 13, fill: c.ink }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="High" isAnimationActive={false} dataKey="high" stroke={c.band} fill={c.band} fillOpacity={0.55} />
            <Radar name="Score" isAnimationActive={false} dataKey="score" stroke={c.score} fill={c.score} fillOpacity={0.5} />
            <Radar name="Low" isAnimationActive={false} dataKey="low" stroke={c.band} fill={c.inner} fillOpacity={0.85} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SkillList({ profile }: { profile: Profile }) {
  return (
    <ul className="flex min-w-0 flex-col divide-y divide-rule self-center">
      {DIMENSIONS.map((d) => {
        const e = profile.dimensions[d];
        const trend = e.trend > 0 ? `+${e.trend.toFixed(1)}` : e.trend < 0 ? `−${Math.abs(e.trend).toFixed(1)}` : "no change";
        return (
          <li key={d} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <span className="font-semibold">{DIMENSION_LABELS[d]}</span>
            {e.n_obs < 5 ? (
              <span className="text-sm muted">
                Still learning about you ({Math.round(e.low)}–{Math.round(e.high)} so far)
              </span>
            ) : (
              <span className="figure text-2xl">
                {Math.round(e.score)}% <span className="text-base font-medium text-muted">± {spread(e.low, e.high)}</span>
              </span>
            )}
            <div className="relative h-2.5 rounded-full bg-paper-2" aria-hidden>
              <div className="absolute h-2.5 rounded-full bg-mat-2" style={{ left: `${e.low}%`, width: `${e.high - e.low}%` }} />
              <div className="absolute -top-0.5 h-3.5 w-1 rounded bg-ink" style={{ left: `${e.score}%` }} />
            </div>
            <span className="text-sm muted">{trend} this week</span>
          </li>
        );
      })}
    </ul>
  );
}

function DimensionChips({ value, onChange }: { value: DimensionKey; onChange: (d: DimensionKey) => void }) {
  return (
    <div className="seg mt-3 max-w-full overflow-x-auto scroll-row" role="group" aria-label="Skill">
      {DIMENSIONS.map((d) => (
        <button key={d} type="button" aria-pressed={d === value} onClick={() => onChange(d)}>
          {DIMENSION_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

/** Score line with its low-high band. Each point: { x, score, band: [low, high] }. */
function BandChart({ data, xLabel }: { data: { x: string | number; score: number; band: [number, number] }[]; xLabel?: string }) {
  const c = useChartColours();
  return (
    <div className="mt-3 h-60 w-full" role="img" aria-label="Line chart of the score with its range band">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <XAxis dataKey="x" tick={{ fontSize: 12, fill: c.ink }} stroke={c.grid} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -2, fontSize: 12 } : undefined} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: c.ink }} stroke={c.grid} />
          <Tooltip formatter={(v: number | number[]) => (Array.isArray(v) ? `${Math.round(v[0])}–${Math.round(v[1])}` : Math.round(v))} />
          <Area dataKey="band" name="Range" stroke="none" fill={c.band} fillOpacity={0.7} isAnimationActive={false} />
          <Line dataKey="score" name="Score" stroke={c.score} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Progress({ history }: { history: Snapshot[] }) {
  const [dim, setDim] = useState<DimensionKey>("reasoning");
  const data = history.map((s) => {
    const e = s.dimensions[dim];
    return { x: shortDate(s.ts), score: e.score, band: [e.low, e.high] as [number, number] };
  });
  return (
    <section className="card min-w-0" aria-label="Progress">
      <h2>Progress over time</h2>
      <p className="mt-1 text-sm muted">One point after each round. The band narrows as we learn more.</p>
      <DimensionChips value={dim} onChange={setDim} />
      <BandChart data={data} />
    </section>
  );
}

function ProjectionCard({ userId }: { userId: string }) {
  const [perWeek, setPerWeek] = useState(3);
  const [dim, setDim] = useState<DimensionKey>("reasoning");
  const { data, error } = useAsync<Projection>(() => getProjection(userId, perWeek), [userId, perWeek]);
  const points = (data?.points ?? [])
    .filter((p) => p.dimension === dim)
    .map((p) => ({ x: p.week === 0 ? "now" : `wk ${p.week}`, score: p.score, band: [p.low, p.high] as [number, number] }));
  return (
    <section className="card min-w-0" aria-label="What if">
      <h2>What if you keep playing?</h2>
      <label className="mt-3 flex flex-wrap items-center gap-3">
        <span>
          Sessions per week: <b className="figure">{perWeek}</b>
        </span>
        <input
          type="range"
          min={1}
          max={7}
          value={perWeek}
          onChange={(e) => setPerWeek(Number(e.target.value))}
          className="w-48 accent-ink"
          aria-label="Sessions per week"
        />
      </label>
      <DimensionChips value={dim} onChange={setDim} />
      {error && <ErrorNote error={error} />}
      {points.length > 0 && <BandChart data={points} />}
      <p className="mt-2 text-sm muted">
        {data?.disclaimer ?? "Estimate based on your own past progress. Not a prediction of ability."}
      </p>
    </section>
  );
}

function Matches({ matches }: { matches: MatchSummary[] | null }) {
  return (
    <section className="card min-w-0" aria-label="Match history">
      <h2>Your matches</h2>
      {!matches || matches.length === 0 ? (
        <p className="mt-2 text-ink-2">
          No matches yet. Pick a target on the <Link to="/rules">Rules</Link> tab and play.
        </p>
      ) : (
        <table className="mt-3 w-full text-left">
          <thead>
            <tr className="text-sm muted">
              <th className="pb-2 font-medium">Result</th>
              <th className="hidden pb-2 font-medium sm:table-cell">Rounds</th>
              <th className="pb-2 font-medium">You</th>
              <th className="pb-2 font-medium">Opponent</th>
              <th className="pb-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {matches.map((m) => (
              <tr key={m.match_id}>
                <td className="py-2 font-semibold">
                  {m.winner === "user" ? "Won" : m.winner === "ai" ? "Lost" : "In progress"}
                  <span className="block text-sm font-medium muted">to {m.target}</span>
                </td>
                <td className="hidden py-2 figure sm:table-cell">{m.rounds.length}</td>
                <td className="py-2 figure">{m.user_total}</td>
                <td className="py-2 figure">{m.ai_total}</td>
                <td className="py-2 text-sm muted">{shortDate(m.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Collab({ collab }: { collab: CollabScore }) {
  const keys = Object.keys(COLLAB_LABELS) as CollabComponent[];
  return (
    <section className="card min-w-0" aria-label="AI Collaboration Score">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2>How you work with the coach</h2>
        <p className="figure text-figure">{collab.total === null ? "–" : Math.round(collab.total)}</p>
      </div>
      <p className="mt-1 text-sm muted">AI Collaboration Score, out of 100. Parts with no data yet are left out.</p>
      <ul className="mt-4 flex flex-col gap-4">
        {keys.map((k) => {
          const c = collab.components[k];
          const label = COLLAB_LABELS[k];
          return (
            <li key={k}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{label.title}</span>
                {c.score === null ? (
                  <span className="text-sm muted">no data yet</span>
                ) : (
                  <span className="text-sm muted">
                    <span className="figure text-base text-ink">{Math.round(c.score)}</span> based on {c.n} {label.unit}
                  </span>
                )}
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-paper-2">
                <div className="h-2.5 rounded-full bg-mint-deep" style={{ width: `${c.score ?? 0}%` }} />
              </div>
              <p className="mt-1 text-sm muted">{label.meaning}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

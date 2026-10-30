// The Brain Twin dashboard (task 3.4): every score with its range, the trend over time, a what-if
// projection (always with its disclaimer), the match history and the AI Collaboration Score.
import { useState } from "react";
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

const BRAND = "#1E5DA8";
const BAND = "#93B4DD";

const COLLAB_LABELS: Record<CollabComponent, { title: string; meaning: string; unit: string }> = {
  clarification: { title: "Clarification", meaning: "You asked \"Why?\" before acting on a hint.", unit: "hints" },
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
        <div className="space-y-6">
          {profile.data.flags.suggest_break && (
            <p className="rounded-xl bg-brand-light p-4 text-brand-dark" role="status">
              You've been playing fast and the last moves were tough. A short break often helps.
            </p>
          )}
          {profile.data.n_rounds === 0 ? (
            <EmptyState />
          ) : (
            <>
              <TwinRadar profile={profile.data} />
              <SkillCards profile={profile.data} />
              {history.data && history.data.length > 1 && <Progress history={history.data} />}
              <ProjectionCard userId={userId} />
            </>
          )}
          <Matches matches={matches.data} />
          {collab.data && <Collab collab={collab.data} />}
        </div>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <section className="card text-center">
      <p className="text-lg font-semibold">No rounds yet</p>
      <p className="mt-1 text-slate-600">Play a round of Rami and your Brain Twin starts learning about you.</p>
      <Link className="btn-primary mt-4 inline-block" to="/play">
        Play a round
      </Link>
    </section>
  );
}

function TwinRadar({ profile }: { profile: Profile }) {
  const data = DIMENSIONS.map((d) => ({ dimension: DIMENSION_LABELS[d], ...profile.dimensions[d] }));
  return (
    <section className="card" aria-label="Skills radar">
      <h2 className="font-semibold">Your five skills</h2>
      <p className="text-sm text-slate-600">The dark shape is your score; the light band is the range we are sure of.</p>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 13 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="High" dataKey="high" stroke={BAND} fill={BAND} fillOpacity={0.35} />
            <Radar name="Score" dataKey="score" stroke={BRAND} fill={BRAND} fillOpacity={0.45} />
            <Radar name="Low" dataKey="low" stroke={BAND} fill="#ffffff" fillOpacity={0.6} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function SkillCards({ profile }: { profile: Profile }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {DIMENSIONS.map((d) => {
        const e = profile.dimensions[d];
        return (
          <li key={d} className="card">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{DIMENSION_LABELS[d]}</span>
              <span className="text-sm text-slate-500">
                {e.trend > 0 ? "▲" : e.trend < 0 ? "▼" : "■"} {Math.abs(e.trend).toFixed(1)} this week
              </span>
            </div>
            {e.n_obs < 5 ? (
              <p className="mt-2 text-slate-500">
                Still learning about you ({Math.round(e.low)}–{Math.round(e.high)} so far)
              </p>
            ) : (
              <p className="mt-1 text-2xl font-bold text-brand">
                {Math.round(e.score)}% <span className="text-base font-normal text-slate-500">± {spread(e.low, e.high)}</span>
              </p>
            )}
            <div className="relative mt-3 h-3 rounded-full bg-slate-100" aria-hidden>
              <div className="absolute h-3 rounded-full bg-brand/30" style={{ left: `${e.low}%`, width: `${e.high - e.low}%` }} />
              <div className="absolute h-3 w-1 rounded bg-brand" style={{ left: `${e.score}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DimensionChips({ value, onChange }: { value: DimensionKey; onChange: (d: DimensionKey) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Skill">
      {DIMENSIONS.map((d) => (
        <button
          key={d}
          className={`rounded-full px-3 py-1 text-sm ${d === value ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}
          aria-pressed={d === value}
          onClick={() => onChange(d)}
        >
          {DIMENSION_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

/** Score line with its low-high band. Each point: { x, score, band: [low, high] }. */
function BandChart({ data, xLabel }: { data: { x: string | number; score: number; band: [number, number] }[]; xLabel?: string }) {
  return (
    <div className="mt-3 h-60 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <XAxis dataKey="x" tick={{ fontSize: 12 }} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -2, fontSize: 12 } : undefined} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number | number[]) => (Array.isArray(v) ? `${Math.round(v[0])}–${Math.round(v[1])}` : Math.round(v))} />
          <Area dataKey="band" name="Range" stroke="none" fill={BAND} fillOpacity={0.45} isAnimationActive={false} />
          <Line dataKey="score" name="Score" stroke={BRAND} strokeWidth={2} dot={false} isAnimationActive={false} />
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
    <section className="card" aria-label="Progress">
      <h2 className="font-semibold">Progress over time</h2>
      <p className="text-sm text-slate-600">One point after each round. The band narrows as we learn more.</p>
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
    <section className="card" aria-label="What if">
      <h2 className="font-semibold">What if you keep playing?</h2>
      <label className="mt-3 flex flex-wrap items-center gap-3">
        <span>Sessions per week: <b>{perWeek}</b></span>
        <input
          type="range"
          min={1}
          max={7}
          value={perWeek}
          onChange={(e) => setPerWeek(Number(e.target.value))}
          className="w-48 accent-[#1E5DA8]"
          aria-label="Sessions per week"
        />
      </label>
      <DimensionChips value={dim} onChange={setDim} />
      {error && <ErrorNote error={error} />}
      {points.length > 0 && <BandChart data={points} />}
      <p className="mt-2 text-sm text-slate-600">
        {data?.disclaimer ?? "Estimate based on your own past progress. Not a prediction of ability."}
      </p>
    </section>
  );
}

function Matches({ matches }: { matches: MatchSummary[] | null }) {
  return (
    <section className="card" aria-label="Match history">
      <h2 className="font-semibold">Your matches</h2>
      {!matches || matches.length === 0 ? (
        <p className="mt-1 text-slate-600">
          No matches yet. Pick a target on the{" "}
          <Link className="underline" to="/rules">
            Rules
          </Link>{" "}
          tab and play.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {matches.map((m) => (
            <li key={m.match_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>
                <b>{m.winner === "user" ? "Won" : m.winner === "ai" ? "Lost" : "In progress"}</b> · to {m.target} ·{" "}
                {m.rounds.length} round{m.rounds.length === 1 ? "" : "s"}
              </span>
              <span className="text-slate-600">
                you {m.user_total}, opponent {m.ai_total} · {shortDate(m.started_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Collab({ collab }: { collab: CollabScore }) {
  const keys = Object.keys(COLLAB_LABELS) as CollabComponent[];
  return (
    <section className="card" aria-label="AI Collaboration Score">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">How you work with the coach</h2>
        <p className="text-3xl font-bold text-brand">{collab.total === null ? "–" : Math.round(collab.total)}</p>
      </div>
      <p className="text-sm text-slate-600">AI Collaboration Score, out of 100. Parts with no data yet are left out.</p>
      <ul className="mt-3 space-y-3">
        {keys.map((k) => {
          const c = collab.components[k];
          const label = COLLAB_LABELS[k];
          return (
            <li key={k}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{label.title}</span>
                <span className="text-slate-500">
                  {c.score === null ? "no data yet" : `${Math.round(c.score)} · based on ${c.n} ${label.unit}`}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-brand" style={{ width: `${c.score ?? 0}%` }} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{label.meaning}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

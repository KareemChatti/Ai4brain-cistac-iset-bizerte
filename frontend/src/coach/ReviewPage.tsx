// Round review (task 3.3): every key moment can show the recorded facts it is based on
// ("See the evidence"), the better move is revealed on request, and the review can be read aloud
// by the browser (nothing is recorded or stored).
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EvidenceSheet, Fact, Review } from "@shared/types";
import { getEvidence, getReview } from "@/api/client";
import { logEvent, useMatch } from "@/game";
import { useApp } from "@/app/store";
import { useAsync } from "@/app/useAsync";
import { nextStepPath, usePlanRun } from "@/app/planRun";
import { DIMENSION_LABELS, ErrorNote, Loading, PageTitle } from "@/app/ui";

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export default function ReviewPage() {
  const { roundId = "" } = useParams();
  const userId = useApp((s) => s.userId)!;
  const inPlan = usePlanRun((s) => s.index >= 0);
  const navigate = useNavigate();
  const match = useMatch((s) => s.match);
  const { data: review, error, loading } = useAsync(() => getReview(userId, roundId), [userId, roundId]);
  const evidence = useAsync<EvidenceSheet | null>(() => getEvidence(userId, roundId).catch(() => null), [userId, roundId]);

  // Counts toward the AI Collaboration Score's "iteration" part (going back to learn from a round).
  const logged = useRef("");
  useEffect(() => {
    if (!review || logged.current === roundId) return;
    logged.current = roundId;
    logEvent("coach", "review_opened", { round_id: roundId, source: review.source }, roundId);
  }, [review, roundId]);

  const facts = new Map((evidence.data?.facts ?? []).map((f) => [f.id, f]));

  return (
    <>
      <PageTitle sub="What happened in your round, based only on what was recorded.">Round review</PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {review && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xl font-semibold">{review.headline}</p>
            <ReadAloud review={review} />
          </div>
          {review.key_moments.map((m, i) => (
            <Moment key={i} moment={m} facts={m.fact_ids.map((id) => facts.get(id)).filter((f): f is Fact => !!f)} roundId={roundId} />
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
          <p className="text-sm text-muted">
            {review.source === "llm" ? "Written by an AI coach from the facts above; it can be wrong." : "Written from the recorded facts of your round."}
          </p>
          {inPlan && (
            <button className="btn btn-primary" onClick={() => navigate(nextStepPath() ?? "/dashboard")}>
              Continue today’s plan
            </button>
          )}
          {!inPlan && match && (
            <section className="card">
              <p className="font-semibold">
                Match to {match.target}: you {match.totals[0]}, opponent {match.totals[1]}
              </p>
              <button className="btn btn-primary mt-3" onClick={() => navigate("/play")}>
                {match.winner ? "See the match result" : "Next round"}
              </button>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Moment({ moment, facts, roundId }: { moment: Review["key_moments"][number]; facts: Fact[]; roundId: string }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showTip, setShowTip] = useState(false);
  return (
    <article className="card">
      <p className="text-sm text-muted">Turn {moment.turn_no}</p>
      <h2 className="text-lg font-semibold text-ink">{moment.title}</h2>
      <p className="mt-1">{moment.explanation}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn px-3 py-1 text-sm"
          aria-expanded={showTip}
          onClick={() => {
            if (!showTip) logEvent("coach", "better_move_revealed", { turn_no: moment.turn_no }, roundId);
            setShowTip(!showTip);
          }}
        >
          {showTip ? "Hide the better move" : "Show the better move"}
        </button>
        <button className="btn px-3 py-1 text-sm" aria-expanded={showEvidence} onClick={() => setShowEvidence(!showEvidence)}>
          {showEvidence ? "Hide the evidence" : "See the evidence"}
        </button>
      </div>
      {showTip && <p className="mt-3 rounded-lg bg-paper-2 px-3 py-2">{moment.tip}</p>}
      {showEvidence && (
        <div className="mt-3 rounded-lg border border-rule p-3">
          <p className="text-sm font-semibold text-muted">What was recorded</p>
          {facts.length ? (
            <ul className="mt-1 space-y-1">
              {facts.map((f) => (
                <li key={f.id}>
                  <span className="mr-2 rounded bg-paper-2 px-1.5 text-xs text-muted">{f.id}</span>
                  {f.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">The facts for this moment are not available right now.</p>
          )}
        </div>
      )}
    </article>
  );
}

function ReadAloud({ review }: { review: Review }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void (canSpeak() && window.speechSynthesis.cancel()), []);
  if (!canSpeak()) return null;
  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(review.voice_text || review.headline);
    utterance.onend = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  };
  return (
    <button className="btn px-3 py-1 text-sm" onClick={toggle}>
      {speaking ? "Stop reading" : "Read aloud"}
    </button>
  );
}

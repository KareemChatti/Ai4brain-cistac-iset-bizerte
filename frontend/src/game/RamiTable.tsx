// The Rami table. Props are fixed by docs/contracts.md section 2; the app shell mounts it.

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import type { Hint, HintActions, RoundSummary } from "@shared/types";
import { GameConfig, canLayOff, jokerStandsFor, meldValue, parseCard, shortId, topDiscard } from "../engine";
import { CardView } from "./Card";
import { CardTracker } from "./CardTracker";
import { DefaultHintPanel } from "./HintPanel";
import { LiveBadge, LiveCoachFeed } from "./LiveCoachFeed";
import { connectLive } from "./live";
import { setLogContext } from "./logger";
import { createRoundStore, sortedHand } from "./store";

export type RamiTableProps = {
  userId: string;
  sessionId: string;
  opponentLevel: number;
  quickMode: boolean;
  hintsEnabled?: boolean;
  onRoundEnd: (summary: RoundSummary) => void;
  renderHintPanel?: (hint: Hint, actions: HintActions) => ReactNode;
  /** Fixed deal, for demos and tests. */
  seed?: number;
  /** House rules (from the Rules screen); overrides quickMode. */
  config?: GameConfig;
  /** Coach checks during your turn. */
  liveCoach?: boolean;
  /** The id of the match this round belongs to, if any. */
  matchId?: () => string | null;
  /** Called once when the round ends with both players' penalties (for the match score). */
  onRoundScored?: (round: { round_id: string; user: number; ai: number; winner: "user" | "ai" }) => void;
};

export function RamiTable(props: RamiTableProps) {
  const { userId, sessionId, opponentLevel, quickMode, hintsEnabled = true, onRoundEnd, renderHintPanel, seed, config, liveCoach, onRoundScored, matchId } = props;
  setLogContext(userId, sessionId);
  const storeRef = useRef<ReturnType<typeof createRoundStore>>();
  if (!storeRef.current) {
    storeRef.current = createRoundStore({ userId, sessionId, opponentLevel, quickMode, hintsEnabled, seed, config, liveCoach, matchId });
  }
  const store = storeRef.current;
  const s = useStore(store);

  // Start once; on leaving mid-round record an abandoned round. The short delay ignores
  // React StrictMode's mount-unmount-mount in development.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    store.getState().start();
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) {
          store.getState().abandon();
          store.getState().dispose();
        }
      }, 50);
    };
  }, [store]);

  // Open the live session (kept for the rest of the visit, so the review gets the updated profile too).
  useEffect(() => connectLive(userId), [userId]);

  // Report the score once, as soon as the round is over.
  const scored = useRef(false);
  useEffect(() => {
    if (!s.result || scored.current) return;
    scored.current = true;
    const { summary, penalties } = s.result;
    onRoundScored?.({ round_id: summary.round_id, user: penalties[0], ai: penalties[1], winner: summary.winner });
  }, [s.result, onRoundScored]);

  const g = s.game;
  const hand = sortedHand(s);
  const top = topDiscard(g);
  const yourTurn = g.current === 0 && !s.aiThinking && !s.result && g.phase !== "over";
  const selectedCards = s.selected.map(parseCard);
  const single = selectedCards.length === 1 ? selectedCards[0] : null;
  const stagedPoints = useMemo(
    () => s.staged.reduce((sum, ids) => sum + meldValue(ids.map(parseCard)), 0),
    [s.staged],
  );
  const stagedIds = new Set(s.staged.flat());

  const hintActions: HintActions = {
    follow: s.followHint,
    ignore: s.ignoreHint,
    why: s.whyHint,
    check: s.checkHint,
  };
  const hintCard = s.hint?.card ? shortId(s.hint.card) : null;

  let status: string;
  if (s.result) status = s.result.summary.winner === "user" ? "You went out. Well played!" : "Your opponent went out.";
  else if (s.aiThinking) status = "Your opponent is playing…";
  else if (g.phase === "draw") status = "Your turn: draw a card from the stock, or take the top discard.";
  else if (s.userTurn === 1 && g.turn === 0) status = "You start: you have 15 cards, so lay down if you can, then discard one.";
  else status = "Lay down or lay off if you can, then discard one card.";

  return (
    <div className="flex flex-col gap-4">
      {/* Opponent */}
      <section className="card flex flex-wrap items-center justify-between gap-3 py-3" aria-label="Opponent">
        <div>
          <p className="font-semibold">Opponent · level {Math.min(5, Math.max(1, Math.round(opponentLevel)))}</p>
          <p className="text-sm text-slate-600">
            {g.hands[1].length} cards · {g.opened[1] ? "has opened" : "not opened yet"}
          </p>
        </div>
        <div className="flex -space-x-8 sm:-space-x-7">
          {g.hands[1].slice(0, 15).map((c) => (
            <CardView key={c.id} faceDown size="sm" />
          ))}
        </div>
      </section>

      {s.opponentNote && <p className="text-center text-slate-600" aria-live="polite">{s.opponentNote}</p>}

      {/* Table and piles */}
      <section className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="card min-h-[9rem]" aria-label="Table">
          <p className="mb-2 text-sm font-semibold text-slate-600">Table (opening needs {g.config.openingMin} points)</p>
          {g.table.length === 0 && <p className="text-slate-400">No melds yet.</p>}
          <div className="flex flex-wrap gap-4">
            {g.table.map((meld) => {
              const fits = yourTurn && g.phase === "play" && g.opened[0] && single && canLayOff(single, meld.cards);
              const swappable =
                yourTurn && g.phase === "play" && g.opened[0] && single && !single.joker &&
                meld.cards.some((c) => c.joker) && jokerStandsFor(meld.cards).includes(shortId(single.id));
              return (
                <div key={meld.id} className={`rounded-xl p-2 ${fits || swappable ? "bg-brand-light" : ""}`}>
                  <div className="flex -space-x-5">
                    {meld.cards.map((c) => (
                      <CardView key={c.id} id={c.id} size="sm" mark={fits || swappable ? "target" : null} />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{meld.owner === 0 ? "yours" : "opponent's"}</p>
                  <div className="mt-1 flex gap-1">
                    {fits && (
                      <button className="btn-primary px-2 py-1 text-sm" onClick={() => s.playOnMeld(meld.id, "layOff")}>
                        Add here
                      </button>
                    )}
                    {swappable && (
                      <button className="btn-ghost px-2 py-1 text-sm" onClick={() => s.playOnMeld(meld.id, "swap")}>
                        Swap joker
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card flex items-start justify-center gap-6" aria-label="Piles">
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label="Draw from the stock"
              disabled={!yourTurn || g.phase !== "draw"}
              onClick={s.drawStock}
              className="disabled:opacity-60"
            >
              <CardView faceDown size="md" mark={s.hint?.action === "draw_stock" ? "hint" : null} />
            </button>
            <span className="text-sm text-slate-600">Stock · {g.stock.length}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            {top ? (
              <button type="button" aria-label="Take the top discard" disabled={!yourTurn || g.phase !== "draw"} onClick={s.drawDiscard}>
                <CardView id={top.id} size="md" mark={s.hint?.action === "draw_discard" ? "hint" : null} />
              </button>
            ) : (
              <div className="flex h-24 w-[4.25rem] items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-400 sm:h-28 sm:w-20">
                empty
              </div>
            )}
            <span className="text-sm text-slate-600">Discard pile</span>
          </div>
        </div>
      </section>

      {/* Status, recall probe, messages */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-center text-lg font-medium" aria-live="polite">{status}</p>
        <LiveBadge />
      </div>
      <LiveCoachFeed roundId={s.roundId} />
      {s.message && <p className="rounded-xl bg-rose-50 p-3 text-center text-rose-700" role="alert">{s.message}</p>}

      {/* Live coach: only what the engine can prove; it never blocks a move */}
      {s.confirm ? (
        <div className="card border-amber-300 bg-amber-50" role="dialog" aria-label="Coach check">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Coach check before you discard</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {s.confirm.alerts.map((a) => (
              <li key={a.kind}>{a.text}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost px-4 py-2" onClick={s.cancelDiscard}>
              Go back
            </button>
            <button className="btn-primary px-4 py-2" onClick={s.confirmDiscard}>
              Discard anyway
            </button>
          </div>
        </div>
      ) : (
        s.liveCoach &&
        s.alerts.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="status" aria-label="Coach">
            <p className="text-sm font-semibold text-amber-700">Coach</p>
            <ul className="mt-1 space-y-1">
              {s.alerts.map((a) => (
                <li key={a.kind}>{a.text}</li>
              ))}
            </ul>
          </div>
        )
      )}

      {s.probe && (
        <div className="card border-brand" role="dialog" aria-label="Memory question">
          <p className="font-semibold">Quick memory check</p>
          <p className="mt-1">{s.probe.question}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {s.probe.options.map((id) => (
              <CardView key={id} id={id} size="md" onClick={() => s.answerProbe(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      {s.hint && (renderHintPanel ? renderHintPanel(s.hint, hintActions) : <DefaultHintPanel hint={s.hint} actions={hintActions} showWhy={s.showWhy} />)}
      {s.trackerOpen && <CardTracker game={g} onClose={s.closeTracker} />}

      {/* Staged melds */}
      {s.staged.length > 0 && (
        <section className="card border-brand" aria-label="Melds to lay down">
          <p className="font-semibold">
            Ready to lay down: {stagedPoints} points
            {!g.opened[0] && <span className="text-slate-600"> (you need {g.config.openingMin} to open)</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            {s.staged.map((ids, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex -space-x-5">
                  {ids.map((id) => (
                    <CardView key={id} id={id} size="sm" />
                  ))}
                </div>
                <button className="text-sm text-slate-500 underline" onClick={() => s.unstage(i)}>
                  undo
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hand */}
      <section className="card" aria-label="Your hand">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">
            Your hand · {hand.length} cards {g.opened[0] && <span className="text-emerald-700">· opened</span>}
          </p>
          <div className="flex gap-1 text-sm">
            <button className={`rounded-lg px-2 py-1 ${s.sortBy === "suit" ? "bg-brand-light text-brand" : ""}`} onClick={() => s.setSort("suit")}>
              By suit
            </button>
            <button className={`rounded-lg px-2 py-1 ${s.sortBy === "rank" ? "bg-brand-light text-brand" : ""}`} onClick={() => s.setSort("rank")}>
              By rank
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-3">
          {hand
            .filter((c) => !stagedIds.has(c.id))
            .map((c) => (
              <CardView
                key={c.id}
                id={c.id}
                size="md"
                selected={s.selected.includes(c.id)}
                mark={hintCard && shortId(c.id) === hintCard ? "hint" : null}
                onClick={yourTurn ? () => s.toggle(c.id) : undefined}
              />
            ))}
        </div>

        {!s.result && (
          <div className="mt-4 flex flex-wrap gap-2">
            {g.phase === "draw" && yourTurn && (
              <>
                <button className="btn-primary" onClick={s.drawStock}>
                  Draw stock
                </button>
                <button className="btn-ghost" onClick={s.drawDiscard} disabled={!top}>
                  Take discard
                </button>
              </>
            )}
            {g.phase === "play" && yourTurn && (
              <>
                <button className="btn-ghost" onClick={s.stageMeld} disabled={s.selected.length < 3}>
                  Make meld
                </button>
                <button className="btn-primary" onClick={s.layDown} disabled={!s.staged.length && s.selected.length < 3}>
                  Lay down
                </button>
                <button className="btn-primary" onClick={() => s.discard()} disabled={s.selected.length !== 1}>
                  Discard
                </button>
                {(s.selected.length > 0 || s.staged.length > 0) && (
                  <button className="btn-ghost" onClick={s.clearSelection}>
                    Clear
                  </button>
                )}
              </>
            )}
            {s.hintsEnabled && yourTurn && !s.hint && (
              <button className="btn-ghost ml-auto" onClick={s.requestHint}>
                Hint
              </button>
            )}
          </div>
        )}
        {yourTurn && g.phase === "play" && g.opened[0] && single && (
          <p className="mt-2 text-sm text-slate-600">To lay off, choose a highlighted meld on the table.</p>
        )}
      </section>

      {/* End of round */}
      {s.result && (
        <section className="card border-brand text-center" aria-label="Round result">
          <p className="text-xl font-bold">{s.result.summary.winner === "user" ? "You won the round" : "Your opponent won the round"}</p>
          <p className="mt-1 text-slate-600">
            Penalty points: you {s.result.penalties[0]}, opponent {s.result.penalties[1]} · {s.result.summary.turns} turns
          </p>
          <button className="btn-primary mt-4" disabled={s.result.grading} onClick={() => onRoundEnd(s.result!.summary)}>
            {s.result.grading ? "Analysing your decisions…" : "See your review"}
          </button>
        </section>
      )}
    </div>
  );
}

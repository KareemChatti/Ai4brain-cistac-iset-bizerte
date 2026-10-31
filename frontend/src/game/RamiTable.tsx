import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "zustand";
import type { Hint, HintActions, RoundSummary } from "@shared/types";
import { GameConfig, canLayOff, jokerStandsFor, meldValue, parseCard, shortId, topDiscard } from "../engine";
import { CardView } from "./Card";
import { CardTracker } from "./CardTracker";
import { CoachDrawer } from "./CoachDrawer";
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
  seed?: number;
  config?: GameConfig;
  liveCoach?: boolean;
  matchId?: () => string | null;
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

  useEffect(() => connectLive(userId), [userId]);

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

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachFolded, setCoachFolded] = useState(false);
  const hintId = s.hint?.hint_id ?? null;
  useEffect(() => {
    if (hintId) {
      setCoachOpen(true);
      setCoachFolded(false);
    }
  }, [hintId]);
  const coachCount = (s.hint ? 1 : 0) + (s.liveCoach && !s.confirm ? s.alerts.length : 0);
  const level = Math.min(5, Math.max(1, Math.round(opponentLevel)));
  const visibleHand = hand.filter((c) => !stagedIds.has(c.id));
  const turnLabel = s.result ? "Round over" : yourTurn ? "Your turn" : "Opponent";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex items-center justify-between gap-4 px-1" aria-label="Opponent">
          <div>
            <p className="font-semibold">Opponent, level {level}</p>
            <p className="text-sm muted">{g.hands[1].length} cards in hand</p>
            <p className="text-sm muted">{g.opened[1] ? "Has opened" : "Not opened yet"}</p>
          </div>
          <div className="fan fan--opponent shrink-0">
            {g.hands[1].slice(0, 15).map((c) => (
              <CardView key={c.id} faceDown size="sm" />
            ))}
          </div>
        </section>

        {s.opponentNote && <p className="px-1 muted" aria-live="polite">{s.opponentNote}</p>}

        <div className="mat grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6">
          <section className="min-w-0" aria-label="Table">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="text-lg">Table</h2>
              <p className="text-sm">Opening needs {g.config.openingMin} points</p>
            </div>
            {g.table.length === 0 && <p className="mt-3">No melds yet.</p>}
            <div className="mt-3 flex flex-wrap gap-3">
              {g.table.map((meld) => {
                const fits = yourTurn && g.phase === "play" && g.opened[0] && single && canLayOff(single, meld.cards);
                const swappable =
                  yourTurn && g.phase === "play" && g.opened[0] && single && !single.joker &&
                  meld.cards.some((c) => c.joker) && jokerStandsFor(meld.cards).includes(shortId(single.id));
                return (
                  <div key={meld.id} className={`meld ${fits || swappable ? "meld--target" : ""}`}>
                    <div className="fan fan--loose">
                      {meld.cards.map((c) => (
                        <CardView key={c.id} id={c.id} size="sm" mark={fits || swappable ? "target" : null} />
                      ))}
                    </div>
                    <p className="mt-1 text-sm">{meld.owner === 0 ? "Yours" : "Opponent’s"}</p>
                    {(fits || swappable) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {fits && (
                          <button type="button" className="btn btn-sm" onClick={() => s.playOnMeld(meld.id, "layOff")}>
                            Add here
                          </button>
                        )}
                        {swappable && (
                          <button type="button" className="btn btn-sm" onClick={() => s.playOnMeld(meld.id, "swap")}>
                            Swap joker
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex items-start justify-center gap-6 sm:pt-1" aria-label="Piles">
            <div className="pile">
              <button
                type="button"
                aria-label="Draw from the stock"
                disabled={!yourTurn || g.phase !== "draw"}
                onClick={s.drawStock}
                className="pile__button"
              >
                <CardView faceDown size="md" mark={s.hint?.action === "draw_stock" ? "hint" : null} />
              </button>
              <span className="text-sm">Stock</span>
              <span className="text-sm figure">{g.stock.length}</span>
            </div>
            <div className="pile">
              {top ? (
                <button
                  type="button"
                  aria-label="Take the top discard"
                  disabled={!yourTurn || g.phase !== "draw"}
                  onClick={s.drawDiscard}
                  className="pile__button"
                >
                  <CardView key={top.id} id={top.id} size="md" animate="land" mark={s.hint?.action === "draw_discard" ? "hint" : null} />
                </button>
              ) : (
                <div className="pile__empty">Empty</div>
              )}
              <span className="text-sm">Discard pile</span>
            </div>
          </div>
        </div>

        <section className="tray flex flex-col gap-3 p-4 sm:p-5" aria-label="Your hand">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={`turn-pill ${yourTurn ? "" : "turn-pill--wait"}`}>{turnLabel}</span>
            <p className="min-w-0 flex-1 font-medium" aria-live="polite">{status}</p>
            <LiveBadge />
          </div>
          {s.message && <p className="rounded-stock bg-card px-4 py-3 font-medium text-error" role="alert">{s.message}</p>}

          {s.confirm && (
            <div className="rounded-stock bg-card p-4 shadow-card" role="dialog" aria-label="Coach check">
              <h3 className="text-base">Coach check before you discard</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {s.confirm.alerts.map((a) => (
                  <li key={a.kind}>{a.text}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm" onClick={s.cancelDiscard}>
                  Go back
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={s.confirmDiscard}>
                  Discard anyway
                </button>
              </div>
            </div>
          )}

          {s.staged.length > 0 && (
            <section className="rounded-stock bg-card p-4" aria-label="Melds to lay down">
              <p className="font-semibold">Ready to lay down: {stagedPoints} points</p>
              {!g.opened[0] && <p className="text-sm muted">You need {g.config.openingMin} to open</p>}
              <div className="mt-2 flex flex-wrap gap-4">
                {s.staged.map((ids, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="fan fan--loose">
                      {ids.map((id) => (
                        <CardView key={id} id={id} size="sm" />
                      ))}
                    </div>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => s.unstage(i)}>
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              Your hand <span className="font-medium muted">{hand.length} cards</span>
              {g.opened[0] && <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-sm font-medium text-ink">Opened</span>}
            </p>
            <div className="seg" role="group" aria-label="Sort your hand">
              <button type="button" aria-pressed={s.sortBy === "suit"} onClick={() => s.setSort("suit")}>
                By suit
              </button>
              <button type="button" aria-pressed={s.sortBy === "rank"} onClick={() => s.setSort("rank")}>
                By rank
              </button>
            </div>
          </div>

          <div className="hand" style={{ "--n": visibleHand.length } as CSSProperties}>
            {visibleHand.map((c, i) => (
              <CardView
                key={c.id}
                id={c.id}
                size="md"
                index={i}
                animate="deal"
                selected={s.selected.includes(c.id)}
                mark={hintCard && shortId(c.id) === hintCard ? "hint" : null}
                onClick={yourTurn ? () => s.toggle(c.id) : undefined}
              />
            ))}
          </div>

          {!s.result && (
            <div className="flex flex-wrap items-center gap-2">
              {g.phase === "draw" && yourTurn && (
                <>
                  <button type="button" className="btn btn-primary" onClick={s.drawStock}>
                    Draw stock
                  </button>
                  <button type="button" className="btn" onClick={s.drawDiscard} disabled={!top}>
                    Take discard
                  </button>
                </>
              )}
              {g.phase === "play" && yourTurn && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => s.discard()} disabled={s.selected.length !== 1}>
                    Discard
                  </button>
                  <button type="button" className="btn" onClick={s.layDown} disabled={!s.staged.length && s.selected.length < 3}>
                    Lay down
                  </button>
                  <button type="button" className="btn" onClick={s.stageMeld} disabled={s.selected.length < 3}>
                    Make meld
                  </button>
                  {(s.selected.length > 0 || s.staged.length > 0) && (
                    <button type="button" className="btn btn-quiet" onClick={s.clearSelection}>
                      Clear
                    </button>
                  )}
                </>
              )}
              <div className="ml-auto flex gap-2">
                {s.hintsEnabled && yourTurn && !s.hint && (
                  <button type="button" className="btn" onClick={s.requestHint}>
                    Hint
                  </button>
                )}
                <button
                  type="button"
                  className="btn lg:hidden"
                  aria-expanded={coachOpen}
                  aria-controls="coach-drawer"
                  onClick={() => setCoachOpen(true)}
                >
                  Coach{coachCount ? ` (${coachCount})` : ""}
                </button>
              </div>
            </div>
          )}
          {yourTurn && g.phase === "play" && g.opened[0] && single && (
            <p className="text-sm muted">To lay off, choose a highlighted meld on the table.</p>
          )}
        </section>

        {s.result && (
          <section className="card flex flex-col items-start gap-2" aria-label="Round result">
            <h2>{s.result.summary.winner === "user" ? "You won the round" : "Your opponent won the round"}</h2>
            <p className="muted">
              Penalty points: you {s.result.penalties[0]}, opponent {s.result.penalties[1]}
            </p>
            <p className="muted">{s.result.summary.turns} turns</p>
            <button type="button" className="btn btn-primary mt-2" disabled={s.result.grading} onClick={() => onRoundEnd(s.result!.summary)}>
              {s.result.grading ? "Analysing your decisions…" : "See your review"}
            </button>
          </section>
        )}
      </div>

      <CoachDrawer open={coachOpen} folded={coachFolded} onClose={() => setCoachOpen(false)} onFold={setCoachFolded}>
        {!s.confirm && s.liveCoach && s.alerts.length > 0 && (
          <section className="well" role="status" aria-label="Coach">
            <h3 className="text-base">During this turn</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {s.alerts.map((a) => (
                <li key={a.kind}>{a.text}</li>
              ))}
            </ul>
          </section>
        )}
        {s.hint && (renderHintPanel ? renderHintPanel(s.hint, hintActions) : <DefaultHintPanel hint={s.hint} actions={hintActions} showWhy={s.showWhy} />)}
        {s.trackerOpen && <CardTracker game={g} onClose={s.closeTracker} />}
        <LiveCoachFeed roundId={s.roundId} />
        {!s.hint && !s.trackerOpen && !(s.liveCoach && s.alerts.length) && (
          <p className="muted">Tips appear here during your turn. Ask for a hint any time.</p>
        )}
      </CoachDrawer>

      {s.probe && (
        <div className="probe-backdrop">
          <div className="card w-full max-w-md" role="dialog" aria-modal="true" aria-label="Memory question">
            <h2 className="text-xl">Quick memory check</h2>
            <p className="mt-2">{s.probe.question}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {s.probe.options.map((id) => (
                <CardView key={id} id={id} size="md" onClick={() => s.answerProbe(id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

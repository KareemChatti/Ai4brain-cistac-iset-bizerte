// One Rami round: a Zustand store wrapping the engine. The user is player 0 (15 cards,
// starts by discarding); the AI is player 1. Every action logs the events of
// docs/contracts.md section 4. No rules live here: they are all in src/engine.

import { createStore } from "zustand/vanilla";
import type { Hint, RoundSummary } from "@shared/types";
import {
  Action,
  Card,
  CoachAlert,
  CoachAlertKind,
  GameConfig,
  GameState,
  Level,
  applyAction,
  canLayOff,
  chooseAction,
  coachAlerts,
  configFor,
  feedsOpponent,
  findMelds,
  getHint,
  gradeInput,
  greedyDiscard,
  hintWasGood,
  jokerStandsFor,
  legalActions,
  meldKind,
  mulberry32,
  newGame,
  scoreRound,
  shortId,
  shuffle,
  sortHand,
  topDiscard,
} from "../engine";
import { GradeJob, gradeInBackground } from "./grading";
import { flush, logEvent } from "./logger";

export type Probe = { turnNo: number; question: string; options: string[]; answer: string; shownAt: number };

export type RoundOptions = {
  userId: string;
  sessionId: string;
  opponentLevel: number;
  quickMode: boolean;
  hintsEnabled: boolean;
  /** House rules for this round; when missing, quickMode picks the standard or quick rules. */
  config?: GameConfig;
  /** Coach checks during the user's turn (engine/coach.ts). */
  liveCoach?: boolean;
  seed?: number;
  /** Pause between the AI's moves, so the user can follow them. */
  aiDelayMs?: number;
};

export type RoundView = {
  game: GameState;
  roundId: string;
  hintsEnabled: boolean;
  selected: string[];
  staged: string[][];
  sortBy: "suit" | "rank";
  message: string | null;
  opponentNote: string | null;
  aiThinking: boolean;
  hint: Hint | null;
  showWhy: boolean;
  trackerOpen: boolean;
  probe: Probe | null;
  userTurn: number;
  liveCoach: boolean;
  /** What the live coach can prove right now. */
  alerts: CoachAlert[];
  /** A discard waiting for "Discard anyway", with the alerts it would ignore. */
  confirm: { cardId: string; alerts: CoachAlert[] } | null;
  result: { summary: RoundSummary; penalties: [number, number]; grading: boolean } | null;
};

export type RoundActions = {
  start: () => void;
  toggle: (id: string) => void;
  clearSelection: () => void;
  setSort: (by: "suit" | "rank") => void;
  drawStock: () => void;
  drawDiscard: () => void;
  stageMeld: () => void;
  unstage: (index: number) => void;
  layDown: () => void;
  playOnMeld: (meldId: number, mode: "layOff" | "swap") => void;
  discard: (cardId?: string, force?: boolean) => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  requestHint: () => void;
  followHint: () => void;
  ignoreHint: () => void;
  whyHint: () => void;
  checkHint: () => void;
  closeTracker: () => void;
  answerProbe: (option: string) => void;
  abandon: () => void;
  dispose: () => void;
};

export type RoundStore = RoundView & RoundActions;

const DEFAULT_AI_DELAY_MS = 700;
const PROBE_EVERY = 6;
const PROBE_QUESTIONS = {
  took: "Which card did your opponent take from the discard pile last turn?",
  discarded: "Which card did your opponent discard last turn?",
};

type PendingTurn = Record<string, unknown> & { turn_no: number; discarded: string | null };
type HintRecord = { hint: Hint; turnNo: number; resolved: boolean };

const describe = (id: string) => shortId(id).replace("T", "10");

export function createRoundStore(opts: RoundOptions) {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const level = Math.min(5, Math.max(1, Math.round(opts.opponentLevel))) as Level;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const roundId = crypto.randomUUID();
  const config = opts.config ?? configFor(opts.quickMode);
  const liveCoach = opts.liveCoach ?? false;
  const aiDelay = opts.aiDelayMs ?? DEFAULT_AI_DELAY_MS;
  const log = (source: "rami" | "coach", type: string, payload: Record<string, unknown>) =>
    logEvent(source, type, payload, roundId);

  // Turn bookkeeping that the screen does not need to re-render on.
  const t = {
    started: false,
    startedAt: 0,
    turnStart: 0,
    drawSource: "stock" as "stock" | "discard",
    drawn: "",
    laidDown: [] as string[][],
    laidOff: 0,
    jokerSwaps: 0,
    pending: null as PendingTurn | null,
    jobs: [] as GradeJob[],
    hints: [] as HintRecord[],
    plan: null as "run" | "set" | null,
    planCount: 0,
    planStall: 0,
    aiTook: null as string | null,
    aiDiscarded: null as string | null,
    alertsSeen: new Map<CoachAlertKind, CoachAlert>(),
    timers: [] as ReturnType<typeof setTimeout>[],
  };

  return createStore<RoundStore>()((set, get) => {
    const game = () => get().game;

    // ---------------- live coach ----------------
    const selectedCard = (): Card | null => {
      const { selected } = get();
      if (selected.length !== 1) return null;
      return game().hands[0].find((c) => c.id === selected[0]) ?? null;
    };

    const refreshAlerts = () => {
      if (!liveCoach) return;
      const g = game();
      const alerts = g.current === 0 && !get().result ? coachAlerts(g, 0, selectedCard()) : [];
      for (const a of alerts) t.alertsSeen.set(a.kind, a);
      set({ alerts });
    };

    /** One coach_alert event per kind seen this turn; `followed` = the user acted on it before ending the turn. */
    const logAlerts = (turnNo: number, before: GameState, discarded: string | null) => {
      if (!t.alertsSeen.size) return;
      const still = new Set(coachAlerts(before, 0, null).map((a) => a.kind));
      for (const [kind, alert] of t.alertsSeen) {
        let followed = !still.has(kind);
        if (kind === "feeds_opponent") {
          const card = discarded ? before.hands[0].find((c) => c.id === discarded) : null;
          followed = !card || feedsOpponent(before, 0, card) === null;
        }
        log("coach", "coach_alert", { kind, turn_no: turnNo, cards: alert.cards.map(shortId), followed });
      }
      t.alertsSeen.clear();
    };

    const apply = (action: Action): boolean => {
      try {
        const before = game();
        const next = applyAction(before, action);
        set({ game: next, message: null });
        if (next.phase === "over") {
          if (next.winner === 0 && action.type !== "discard") logAlerts(get().userTurn, before, null);
          endRound();
        } else refreshAlerts();
        return true;
      } catch (err) {
        set({ message: (err as Error).message });
        return false;
      }
    };

    const isUserTurn = () => {
      const s = get();
      return !s.result && !s.aiThinking && !s.probe && s.game.current === 0 && s.game.phase !== "over";
    };

    // ---------------- hints ----------------
    const activeHint = () => t.hints.find((h) => !h.resolved && h.turnNo === get().userTurn) ?? null;
    const resolveHint = (kind: "draw" | "lay_down" | "discard", detail?: { action?: string; card?: string }) => {
      const record = activeHint();
      if (!record) return;
      const { hint } = record;
      let followed: boolean | null = null;
      if (kind === "draw" && hint.action.startsWith("draw")) followed = hint.action === detail?.action;
      if (kind === "lay_down" && hint.action === "lay_down") followed = true;
      if (kind === "discard") {
        followed = hint.action === "discard" ? shortId(hint.card ?? "") === shortId(detail?.card ?? "") : false;
      }
      if (followed === null) return;
      record.resolved = true;
      log("coach", "hint_followed", { hint_id: hint.hint_id, followed });
      set({ hint: null, showWhy: false });
    };

    // ---------------- turns ----------------
    const beginUserTurn = () => {
      const userTurn = get().userTurn + 1;
      Object.assign(t, { drawSource: "stock", drawn: "", laidDown: [], laidOff: 0, jokerSwaps: 0 });
      t.turnStart = performance.now();
      const probe = makeProbe(userTurn);
      t.alertsSeen.clear();
      set({ userTurn, probe, selected: [], staged: [], hint: null, showWhy: false, alerts: [], confirm: null });
    };

    const makeProbe = (userTurn: number): Probe | null => {
      if (userTurn < 3 || userTurn % PROBE_EVERY !== 3) return null;
      const answer = t.aiTook ?? t.aiDiscarded;
      if (!answer) return null;
      const question = t.aiTook ? PROBE_QUESTIONS.took : PROBE_QUESTIONS.discarded;
      const faces = new Set([shortId(answer)]);
      const pool = shuffle(
        [...game().discard, ...game().hands[0], ...game().table.flatMap((m) => m.cards)].filter((c) => !c.joker),
        rng,
      );
      const options = [answer];
      for (const card of pool) {
        if (options.length === 4) break;
        if (!faces.has(shortId(card.id))) {
          faces.add(shortId(card.id));
          options.push(card.id);
        }
      }
      return { turnNo: userTurn, question, options: shuffle(options, rng), answer, shownAt: performance.now() };
    };

    const emitPending = (fedOpponent: boolean) => {
      if (!t.pending) return;
      log("rami", "turn", { ...t.pending, fed_opponent: fedOpponent });
      t.pending = null;
    };

    const missedNow = (g: GameState) => {
      const hand = g.hands[0];
      if (!g.opened[0]) {
        const opening = findMelds(hand, "opening");
        return { lay_offs: 0, joker_swaps: 0, melds_in_hand: opening.meldPoints >= g.config.openingMin ? opening.melds.length : 0 };
      }
      const jokerTargets = g.table.flatMap((m) => (m.cards.some((c) => c.joker) ? jokerStandsFor(m.cards) : []));
      return {
        lay_offs: hand.filter((c) => g.table.some((m) => canLayOff(c, m.cards))).length,
        joker_swaps: hand.filter((c) => !c.joker && jokerTargets.includes(shortId(c.id))).length,
        melds_in_hand: findMelds(hand).melds.length,
      };
    };

    /** Partial melds left in hand: pairs toward runs vs toward sets. */
    const partials = (hand: Card[]) => {
      const loose = findMelds(hand).deadwood.filter((c) => !c.joker);
      let run = 0;
      let setPairs = 0;
      loose.forEach((a, i) =>
        loose.slice(i + 1).forEach((b) => {
          if (a.rank === b.rank && a.suit !== b.suit) setPairs++;
          const gap = Math.abs("A23456789TJQK".indexOf(a.rank!) - "A23456789TJQK".indexOf(b.rank!));
          if (a.suit === b.suit && gap >= 1 && gap <= 2) run++;
        }),
      );
      return { run, set: setPairs };
    };

    const trackPlan = (handAfter: Card[], turnNo: number) => {
      const p = partials(handAfter);
      const now = p.run > p.set ? "run" : p.set > p.run ? "set" : t.plan;
      if (t.plan && now && now !== t.plan) {
        log("rami", "plan_switch", { turn_no: turnNo, from: t.plan, to: now, turns_waited: t.planStall });
        t.planStall = 0;
        t.planCount = p[now];
      } else if (now) {
        t.planStall = p[now] > t.planCount ? 0 : t.planStall + 1;
        t.planCount = p[now];
      }
      t.plan = now;
    };

    // ---------------- AI ----------------
    const aiStep = (first: boolean) => {
      const s = game();
      if (s.phase === "over" || s.current !== 1) return;
      let action = chooseAction(s, level, rng);
      let next: GameState;
      try {
        next = applyAction(s, action);
      } catch {
        const legal = legalActions(s);
        action =
          legal.find((a) => a.type === "layDown" || a.type === "layOff") ??
          legal.find((a) => a.type === "discard" && a.cardId === greedyDiscard(s.hands[1], s.mustUse).id) ??
          legal[legal.length - 1];
        next = applyAction(s, action);
      }
      if (first) {
        t.aiTook = null;
        t.aiDiscarded = null;
      }
      let note = "";
      switch (action.type) {
        case "drawStock":
          note = "Your opponent drew from the stock.";
          break;
        case "drawDiscard": {
          const taken = topDiscard(s)!.id;
          t.aiTook = taken;
          note = `Your opponent took ${describe(taken)} from the discard pile.`;
          break;
        }
        case "layDown":
          note = `Your opponent laid down ${action.melds.length} meld${action.melds.length > 1 ? "s" : ""}.`;
          break;
        case "layOff":
          note = `Your opponent laid off ${describe(action.cardId)}.`;
          break;
        case "swapJoker":
          note = "Your opponent swapped a joker from the table.";
          break;
        case "discard":
          t.aiDiscarded = action.cardId;
          note = `Your opponent discarded ${describe(action.cardId)}.`;
          break;
      }
      if (first) emitPending(action.type === "drawDiscard" && t.pending?.discarded === topDiscard(s)?.id);
      set({ game: next, opponentNote: note });
      if (next.phase === "over") {
        set({ aiThinking: false });
        endRound();
        return;
      }
      if (action.type === "discard") {
        set({ aiThinking: false });
        beginUserTurn();
        return;
      }
      t.timers.push(setTimeout(() => aiStep(false), aiDelay * 0.7));
    };

    const startAiTurn = () => {
      set({ aiThinking: true });
      t.timers.push(setTimeout(() => aiStep(true), aiDelay));
    };

    // ---------------- end of round ----------------
    const endRound = () => {
      if (get().result) return;
      const g = game();
      emitPending(false);
      const penalties = scoreRound(g);
      const winner = g.winner === 0 ? "user" : "ai";
      log("rami", "round_end", {
        winner,
        user_penalty: penalties[0],
        ai_penalty: penalties[1],
        turns: g.turn,
        duration_ms: Math.round(performance.now() - t.startedAt),
        abandoned: false,
        opened: g.opened[0],
      });
      const summary: RoundSummary = { round_id: roundId, winner, turns: g.turn, user_penalty: penalties[0] };
      set({ result: { summary, penalties, grading: true }, hint: null, selected: [], staged: [] });
      void flush();

      const graded = new Set<number>();
      void gradeInBackground(t.jobs, (turnNo, grade) => {
        graded.add(turnNo);
        log("rami", "turn_graded", {
          turn_no: turnNo,
          quality: grade.quality,
          best_discard: grade.best_discard,
          turns_to_out_played: grade.turns_to_out_played,
          turns_to_out_best: grade.turns_to_out_best,
        });
        for (const h of t.hints.filter((x) => x.turnNo === turnNo && x.hint.action === "discard" && x.hint.card)) {
          log("coach", "hint_outcome", { hint_id: h.hint.hint_id, was_good: hintWasGood(h.hint.card!, grade) });
        }
      }).then(() => {
        // Hints that were not about a graded discard (draws, lay-downs) are counted as good advice.
        for (const h of t.hints.filter((x) => !(x.hint.action === "discard" && graded.has(x.turnNo)))) {
          log("coach", "hint_outcome", { hint_id: h.hint.hint_id, was_good: h.hint.action !== "discard" });
        }
        void flush();
        const r = get().result;
        if (r) set({ result: { ...r, grading: false } });
      });
    };

    return {
      game: newGame(seed, config, 0),
      roundId,
      hintsEnabled: opts.hintsEnabled,
      selected: [],
      staged: [],
      sortBy: "suit",
      message: null,
      opponentNote: null,
      aiThinking: false,
      hint: null,
      showWhy: false,
      trackerOpen: false,
      probe: null,
      userTurn: 0,
      liveCoach,
      alerts: [],
      confirm: null,
      result: null,

      start: () => {
        if (t.started) return;
        t.started = true;
        t.startedAt = performance.now();
        log("rami", "round_start", {
          opponent_level: level,
          seed,
          quick_mode: config.decks === 1,
          hints_enabled: opts.hintsEnabled,
          live_coach: liveCoach,
          rules: config,
        });
        beginUserTurn();
      },

      toggle: (id) => {
        set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id], message: null }));
        refreshAlerts();
      },
      clearSelection: () => {
        set({ selected: [], staged: [] });
        refreshAlerts();
      },
      setSort: (sortBy) => set({ sortBy }),

      drawStock: () => {
        if (!isUserTurn() || game().phase !== "draw") return;
        const before = new Set(game().hands[0].map((c) => c.id));
        resolveHint("draw", { action: "draw_stock" });
        if (apply({ type: "drawStock" })) {
          t.drawSource = "stock";
          t.drawn = game().hands[0].find((c) => !before.has(c.id))?.id ?? "";
          set({ selected: t.drawn ? [t.drawn] : [] });
        }
      },

      drawDiscard: () => {
        if (!isUserTurn() || game().phase !== "draw") return;
        const top = topDiscard(game());
        resolveHint("draw", { action: "draw_discard" });
        if (top && apply({ type: "drawDiscard" })) {
          t.drawSource = "discard";
          t.drawn = top.id;
          set({ selected: [top.id] });
        }
      },

      stageMeld: () => {
        const { selected, staged } = get();
        const hand = game().hands[0];
        const cards = selected.map((id) => hand.find((c) => c.id === id)!).filter(Boolean);
        if (!meldKind(cards)) {
          set({ message: "These cards do not make a set or a run." });
          return;
        }
        set({ staged: [...staged, selected], selected: [], message: null });
      },

      unstage: (index) => set((s) => ({ staged: s.staged.filter((_, i) => i !== index) })),

      layDown: () => {
        if (!isUserTurn() || game().phase !== "play") return;
        const { staged, selected } = get();
        const melds = staged.length ? staged : selected.length ? [selected] : [];
        if (!melds.length) {
          set({ message: "Select the cards of a meld first." });
          return;
        }
        if (apply({ type: "layDown", melds })) {
          t.laidDown.push(...melds);
          resolveHint("lay_down");
          set({ staged: [], selected: [] });
          if (game().phase === "over") emitPending(false);
        }
      },

      playOnMeld: (meldId, mode) => {
        if (!isUserTurn() || game().phase !== "play") return;
        const { selected } = get();
        if (selected.length !== 1) {
          set({ message: "Select exactly one card, then choose the meld." });
          return;
        }
        const action: Action =
          mode === "swap" ? { type: "swapJoker", cardId: selected[0], meldId } : { type: "layOff", cardId: selected[0], meldId };
        if (apply(action)) {
          if (mode === "swap") t.jokerSwaps++;
          else t.laidOff++;
          set({ selected: [] });
        }
      },

      discard: (cardId, force = false) => {
        if (!isUserTurn() || game().phase !== "play") return;
        const id = cardId ?? (get().selected.length === 1 ? get().selected[0] : null);
        if (!id) {
          set({ message: "Select one card to discard." });
          return;
        }
        const before = game();
        const turnNo = get().userTurn;
        if (liveCoach && !force) {
          // Show what the coach can prove before the discard goes through; the user decides.
          const card = before.hands[0].find((c) => c.id === id) ?? null;
          const alerts = coachAlerts(before, 0, card);
          if (alerts.length) {
            for (const a of alerts) t.alertsSeen.set(a.kind, a);
            set({ confirm: { cardId: id, alerts }, alerts });
            return;
          }
        }
        set({ confirm: null });
        const payload: PendingTurn = {
          turn_no: turnNo,
          draw_source: t.drawSource,
          drawn: t.drawn,
          discarded: id,
          laid_down: t.laidDown,
          laid_off: t.laidOff,
          joker_swaps: t.jokerSwaps,
          think_ms: Math.round(performance.now() - t.turnStart),
          options_count: legalActions(before).length,
          missed: missedNow(before),
          quality: null,
          best_discard: null,
          turns_to_out_played: null,
          turns_to_out_best: null,
        };
        const job: GradeJob = { turnNo, input: gradeInput(before, 0), played: id };
        logAlerts(turnNo, before, id);
        if (!apply({ type: "discard", cardId: id })) return;
        set({ alerts: [] });
        resolveHint("discard", { card: id });
        t.jobs.push(job);
        trackPlan(game().hands[0], turnNo);
        t.pending = payload;
        set({ selected: [], staged: [] });
        if (game().phase === "over") {
          emitPending(false);
          return;
        }
        startAiTurn();
      },

      confirmDiscard: () => {
        const c = get().confirm;
        if (c) get().discard(c.cardId, true);
      },

      cancelDiscard: () => set({ confirm: null }),

      requestHint: () => {
        const s = get();
        if (!s.hintsEnabled || !isUserTurn() || s.hint) return;
        const hint = getHint(s.game, 0, rng);
        t.hints.push({ hint, turnNo: s.userTurn, resolved: false });
        log("coach", "hint_requested", {
          hint_id: hint.hint_id,
          turn_no: s.userTurn,
          ms_into_turn: Math.round(performance.now() - t.turnStart),
        });
        log("coach", "hint_shown", { hint_id: hint.hint_id, action: hint.action, card: hint.card, confidence: hint.confidence });
        set({ hint, showWhy: false });
      },

      followHint: () => {
        const { hint } = get();
        if (!hint) return;
        const actions = get();
        if (hint.action === "draw_stock") actions.drawStock();
        else if (hint.action === "draw_discard") actions.drawDiscard();
        else if (hint.action === "discard" && hint.card) actions.discard(hint.card);
        else if (hint.action === "lay_down") {
          const g = game();
          const best = findMelds(g.hands[0], g.opened[0] ? "deadwood" : "opening");
          set({ staged: best.melds.map((m) => m.map((c) => c.id)) });
          actions.layDown();
        }
      },

      ignoreHint: () => set({ hint: null, showWhy: false }),

      whyHint: () => {
        const { hint } = get();
        if (!hint) return;
        log("coach", "hint_why", { hint_id: hint.hint_id });
        set({ showWhy: true });
      },

      checkHint: () => {
        const { hint } = get();
        if (hint) log("coach", "hint_checked", { hint_id: hint.hint_id });
        set({ trackerOpen: true });
      },

      closeTracker: () => set({ trackerOpen: false }),

      answerProbe: (option) => {
        const { probe } = get();
        if (!probe) return;
        log("rami", "recall_probe", {
          turn_no: probe.turnNo,
          question: probe.question,
          correct: shortId(option) === shortId(probe.answer),
          rt_ms: Math.round(performance.now() - probe.shownAt),
        });
        t.turnStart = performance.now();
        set({ probe: null });
      },

      abandon: () => {
        if (get().result || !t.started) return;
        const g = game();
        emitPending(false);
        const penalties = scoreRound({ ...g, winner: 1 });
        log("rami", "round_end", {
          winner: "ai",
          user_penalty: penalties[0],
          ai_penalty: 0,
          turns: g.turn,
          duration_ms: Math.round(performance.now() - t.startedAt),
          abandoned: true,
          opened: g.opened[0],
        });
        void flush();
      },

      dispose: () => {
        t.timers.forEach(clearTimeout);
        t.timers = [];
      },
    };
  });
}

/** The user's hand in display order. */
export const sortedHand = (s: RoundView) => sortHand(s.game.hands[0], s.sortBy);

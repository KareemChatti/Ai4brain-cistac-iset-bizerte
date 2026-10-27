import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@shared/types";
import { chooseAction, mulberry32 } from "../../engine";
import { onEvent, setLogContext } from "../logger";
import { createRoundStore } from "../store";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

/** Play one round: the "user" is driven by the level-2 AI through the store's own actions. */
async function playRound(seed: number, hints = true) {
  const store = createRoundStore({
    userId: USER,
    sessionId: SESSION,
    opponentLevel: 3,
    quickMode: true,
    hintsEnabled: hints,
    seed,
    aiDelayMs: 0,
  });
  const rng = mulberry32(seed);
  store.getState().start();
  for (let guard = 0; guard < 3000 && !store.getState().result; guard++) {
    const s = store.getState();
    if (s.aiThinking || s.game.current !== 0) {
      await new Promise((r) => setTimeout(r, 0));
      continue;
    }
    if (s.probe) {
      s.answerProbe(s.probe.options[0]);
      continue;
    }
    if (hints && !s.hint && s.userTurn % 4 === 1) {
      s.requestHint();
      store.getState().whyHint();
      continue;
    }
    const action = chooseAction(s.game, 2, rng);
    if (action.type === "drawStock") s.drawStock();
    else if (action.type === "drawDiscard") s.drawDiscard();
    else if (action.type === "layDown") {
      store.setState({ staged: action.melds });
      s.layDown();
    } else if (action.type === "layOff" || action.type === "swapJoker") {
      store.setState({ selected: [action.cardId] });
      s.playOnMeld(action.meldId, action.type === "layOff" ? "layOff" : "swap");
    } else s.discard(action.cardId);
    if (store.getState().message) throw new Error(store.getState().message!);
  }
  // Wait for the grader.
  for (let i = 0; i < 500 && store.getState().result?.grading; i++) await new Promise((r) => setTimeout(r, 5));
  return store;
}

describe("a full round through the table store", () => {
  let events: Event[] = [];
  let stop: () => void;
  beforeEach(() => {
    events = [];
    setLogContext(USER, SESSION);
    stop = onEvent((e) => events.push(e));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    stop();
    vi.restoreAllMocks();
  });

  it("ends with a result and logs the contract events", async () => {
    const store = await playRound(11);
    const result = store.getState().result!;
    expect(result).not.toBeNull();
    expect(result.grading).toBe(false);

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("round_start");
    expect(types).toContain("turn");
    expect(types).toContain("round_end");
    expect(types).toContain("turn_graded");
    expect(types).toContain("hint_requested");
    expect(types).toContain("hint_shown");
    expect(types).toContain("hint_why");
    expect(types).toContain("hint_outcome");

    for (const e of events) {
      expect(e.user_id).toBe(USER);
      expect(e.session_id).toBe(SESSION);
      expect(e.round_id).toBe(store.getState().roundId);
      expect(e.ts).toMatch(/Z$/);
    }
  }, 60_000);

  it("turn events carry every contract field", async () => {
    await playRound(12, false);
    const turns = events.filter((e) => e.type === "turn");
    expect(turns.length).toBeGreaterThan(2);
    for (const t of turns) {
      expect(Object.keys(t.payload).sort()).toEqual(
        [
          "best_discard", "discarded", "draw_source", "drawn", "fed_opponent", "joker_swaps", "laid_down", "laid_off",
          "missed", "options_count", "quality", "think_ms", "turn_no", "turns_to_out_best", "turns_to_out_played",
        ].sort(),
      );
      expect(t.payload.quality).toBeNull();
      expect(Object.keys(t.payload.missed as object).sort()).toEqual(["joker_swaps", "lay_offs", "melds_in_hand"]);
    }
    // Turn numbers are 1, 2, 3...
    expect(turns.map((t) => t.payload.turn_no)).toEqual(turns.map((_, i) => i + 1));
  }, 60_000);

  it("grades every discarded turn after the round", async () => {
    await playRound(13, false);
    const discards = events.filter((e) => e.type === "turn" && e.payload.discarded).map((e) => e.payload.turn_no);
    const graded = events.filter((e) => e.type === "turn_graded");
    expect(graded.map((e) => e.payload.turn_no).sort()).toEqual([...discards].sort());
    for (const g of graded) {
      const q = g.payload.quality as number;
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
      expect(typeof g.payload.best_discard).toBe("string");
    }
  }, 60_000);

  it("round_end matches the contract and the result shown", async () => {
    const store = await playRound(14, false);
    const end = events.find((e) => e.type === "round_end")!;
    expect(Object.keys(end.payload).sort()).toEqual(
      ["abandoned", "ai_penalty", "duration_ms", "opened", "turns", "user_penalty", "winner"].sort(),
    );
    expect(end.payload.abandoned).toBe(false);
    expect(end.payload.winner).toBe(store.getState().result!.summary.winner);
  }, 60_000);

  it("logs an abandoned round when the player leaves", () => {
    const store = createRoundStore({ userId: USER, sessionId: SESSION, opponentLevel: 2, quickMode: true, hintsEnabled: false, seed: 3 });
    store.getState().start();
    store.getState().abandon();
    store.getState().dispose();
    const end = events.find((e) => e.type === "round_end")!;
    expect(end.payload.abandoned).toBe(true);
  });
});

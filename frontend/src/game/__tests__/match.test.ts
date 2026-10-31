import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RULES, matchWinner, useMatch } from "../match";

beforeEach(() => {
  localStorage.clear();
  useMatch.setState({ rules: { ...DEFAULT_RULES, matchTarget: 401 }, match: null });
});

describe("match to a target", () => {
  it("adds penalties until someone reaches the target, and that player loses", () => {
    const { recordRound } = useMatch.getState();
    recordRound({ round_id: "r1", user: 0, ai: 250, winner: "user" });
    recordRound({ round_id: "r1", user: 0, ai: 250, winner: "user" });
    expect(useMatch.getState().match).toMatchObject({ totals: [0, 250], winner: null });
    recordRound({ round_id: "r2", user: 40, ai: 160, winner: "user" });
    expect(useMatch.getState().match).toMatchObject({ totals: [40, 410], winner: "user" });
  });

  it("starts a fresh match after one is won", () => {
    const { recordRound } = useMatch.getState();
    recordRound({ round_id: "a", user: 500, ai: 0, winner: "ai" });
    expect(useMatch.getState().match?.winner).toBe("ai");
    recordRound({ round_id: "b", user: 10, ai: 0, winner: "ai" });
    expect(useMatch.getState().match).toMatchObject({ totals: [10, 0], winner: null });
  });

  it("keeps no match for single rounds", () => {
    useMatch.setState({ rules: { ...DEFAULT_RULES, matchTarget: null } });
    useMatch.getState().recordRound({ round_id: "x", user: 10, ai: 0, winner: "ai" });
    expect(useMatch.getState().match).toBeNull();
  });

  it("gives the match to the lower total when both pass the target", () => {
    expect(matchWinner([420, 405], 401)).toBe("ai");
    expect(matchWinner([100, 400], 401)).toBeNull();
  });
});

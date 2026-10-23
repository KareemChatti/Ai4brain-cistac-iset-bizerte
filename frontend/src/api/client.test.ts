import { beforeEach, describe, expect, it } from "vitest";
import plan from "@shared/fixtures/plan.json";
import profile from "@shared/fixtures/profile.json";
import * as api from "./client";
import { resetMock } from "./mock";

const USER = "11111111-1111-4111-8111-111111111111";

describe("api client in mock mode", () => {
  beforeEach(() => resetMock());

  it("is in mock mode under test", () => {
    expect(api.USE_MOCK).toBe(true);
  });

  it("returns the fixtures for read endpoints", async () => {
    expect(await api.getProfile(USER)).toEqual(profile);
    expect(await api.getPlan(USER)).toEqual(plan);
    const history = await api.getHistory(USER);
    expect(history.length).toBeGreaterThan(0);
    const heat = await api.getHeatmap(USER);
    expect(heat.cells).toHaveLength(heat.rows.length);
  });

  it("passes sessions_per_week through to the projection", async () => {
    const p = await api.getProjection(USER, 6);
    expect(p.sessions_per_week).toBe(6);
    expect(p.disclaimer.length).toBeGreaterThan(0);
  });

  it("creates a user id and keeps goals in memory", async () => {
    const { user_id } = await api.createUser("player");
    expect(user_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await api.getGoals(USER)).toEqual([]);
    const goals = await api.postGoal(USER, "memory", 80);
    expect(goals).toHaveLength(1);
    expect(goals[0].progress).toBeGreaterThan(0);
  });

  it("returns a review for the requested round", async () => {
    const r = await api.getReview(USER, "abc");
    expect(r.round_id).toBe("abc");
    expect(["llm", "template"]).toContain(r.source);
  });

  it("counts accepted events", async () => {
    const r = await api.postEvents([]);
    expect(r.accepted).toBe(0);
  });
});

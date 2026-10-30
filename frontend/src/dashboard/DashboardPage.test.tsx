import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "@shared/types";
import profileFixture from "@shared/fixtures/profile.json";
import { useApp } from "@/app/store";
import DashboardPage from "./DashboardPage";

// Lets a test replace the mock profile (the rest of the client stays in mock mode).
const override = vi.hoisted(() => ({ profile: null as Profile | null }));
vi.mock("@/api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/api/client")>();
  return { ...mod, getProfile: (id: string) => (override.profile ? Promise.resolve(override.profile) : mod.getProfile(id)) };
});

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  override.profile = null;
});

function renderDashboard() {
  useApp.setState({ userId: "u1" });
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("dashboard", () => {
  it("shows the skills with their ranges, the projection disclaimer and the collaboration score", async () => {
    renderDashboard();
    expect(await screen.findByText("Your five skills")).toBeTruthy();
    expect(screen.getAllByText(/± \d+/).length).toBeGreaterThan(0);
    expect(screen.getByText("How you work with the coach")).toBeTruthy();
    expect(await screen.findByText(/Not a prediction of ability/)).toBeTruthy();
    expect(screen.getByLabelText("Sessions per week")).toBeTruthy();
    expect(screen.getByText(/No matches yet/)).toBeTruthy();
  });

  it("invites a new player to play their first round", async () => {
    override.profile = { ...(profileFixture as unknown as Profile), n_rounds: 0 };
    renderDashboard();
    expect(await screen.findByText("No rounds yet")).toBeTruthy();
    expect(screen.queryByText("Your five skills")).toBeNull();
  });

  it("suggests a break when the profile asks for one", async () => {
    const p = profileFixture as unknown as Profile;
    override.profile = { ...p, flags: { suggest_break: true } };
    renderDashboard();
    expect(await screen.findByText(/A short break often helps/)).toBeTruthy();
  });
});

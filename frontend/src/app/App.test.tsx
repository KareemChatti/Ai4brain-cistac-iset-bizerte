import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { CONSENT_VERSION, useApp } from "./store";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("app shell", () => {
  it("sends a new user to the welcome page", async () => {
    useApp.setState({ userId: "u1", consentVersion: null });
    renderAt("/dashboard");
    expect(await screen.findByText(/It is not a medical test/)).toBeTruthy();
  });

  it("shows today's plan from the mock API", async () => {
    useApp.setState({ userId: "u1", consentVersion: CONSENT_VERSION });
    renderAt("/home");
    expect(await screen.findByText(/Reasoning has the lowest score/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("mounts the Rami table slot on /play", async () => {
    useApp.setState({ userId: "u1", consentVersion: CONSENT_VERSION });
    renderAt("/play");
    expect(await screen.findByLabelText("Your hand")).toBeTruthy();
  });
});

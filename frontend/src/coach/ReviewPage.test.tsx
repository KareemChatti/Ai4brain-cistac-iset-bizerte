import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useApp } from "@/app/store";
import ReviewPage from "./ReviewPage";

afterEach(cleanup);

function renderReview() {
  useApp.setState({ userId: "u1" });
  return render(
    <MemoryRouter initialEntries={["/review/33333333-3333-4333-8333-333333333333"]}>
      <Routes>
        <Route path="/review/:roundId" element={<ReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("round review", () => {
  it("shows the recorded facts a key moment cites, only when asked", async () => {
    renderReview();
    expect(await screen.findByText("You fed your opponent's run")).toBeTruthy();
    expect(screen.queryByText(/Two turns earlier the opponent had picked up 7H/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "See the evidence" })[0]);
    expect(await screen.findByText(/Two turns earlier the opponent had picked up 7H/)).toBeTruthy();
    expect(screen.getByText("F1")).toBeTruthy();
  });

  it("reveals the better move on request", async () => {
    renderReview();
    const tip = /glance at what your opponent took from the discard pile/;
    await screen.findByText("You fed your opponent's run");
    expect(screen.queryByText(tip)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Show the better move" })[0]);
    expect(screen.getByText(tip)).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { nicknameProblem } from "./WelcomePage";

describe("nickname check (same rules as the backend)", () => {
  it("accepts nicknames, Arabic letters included", () => {
    for (const ok of ["Hey", "RamiFan 2", "بطل_الرامي", "demo-new (simulated)"]) expect(nicknameProblem(ok)).toBeNull();
  });
  it("refuses empty, too long and contact details", () => {
    expect(nicknameProblem("   ")).toMatch(/Choose/);
    expect(nicknameProblem("x".repeat(33))).toMatch(/32/);
    for (const bad of ["hey@gmail.com", "+216 22 333 444", "www.example.com"]) expect(nicknameProblem(bad)).toMatch(/not an email/);
    expect(nicknameProblem("<script>")).toMatch(/letters/);
  });
});

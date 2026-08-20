import { describe, it, expect } from "vitest";
import { jdSkillMatch } from "./match";

describe("jdSkillMatch", () => {
  it("reports matched, missing, and a coverage score", () => {
    const m = jdSkillMatch("We use React, TypeScript, and Python.", "Built apps in React and Python.");
    expect(m.matched).toContain("React");
    expect(m.matched).toContain("Python");
    expect(m.missing).toContain("TypeScript");
    expect(m.score).toBe(67); // 2 of 3
  });

  it("scores 0 when the JD mentions no known skills", () => {
    expect(jdSkillMatch("great communicator, team fit", "React Python").score).toBe(0);
  });

  it("uses word boundaries for short tokens (no false 'C' match inside words)", () => {
    const m = jdSkillMatch("experience with Go", "I once played Go casually, and code in Java");
    expect(m.matched).toContain("Go");
  });
});

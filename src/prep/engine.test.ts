import { describe, it, expect } from "vitest";
import { scheduleReview, buildOverview, REVIEW_INTERVALS } from "./engine";
import type { CodingProblem } from "../db/codingProblems";
import type { Pattern } from "./patterns";

const NOW = Date.UTC(2026, 7, 1);
const mkProblem = (p: Partial<CodingProblem> & { patterns: Pattern[] }): CodingProblem => ({
  id: 1, name: "P", url: null, difficulty: "medium", result: "solved", time_minutes: 20,
  hints_used: 0, solution_quality: "optimal", confidence: 5, failure_reasons: [], source: "manual",
  solved_at: new Date(NOW).toISOString(), next_review_at: null, review_stage: null,
  created_at: new Date(NOW).toISOString(), ...p,
});

describe("scheduleReview", () => {
  it("sends a failure to the shortest interval", () => {
    const s = scheduleReview("failed", 2, 3, NOW);
    expect(s.stage).toBe(0);
    expect(s.nextReviewAt).toBe(new Date(NOW + REVIEW_INTERVALS[0] * 86_400_000).toISOString());
  });
  it("first solve lands at the 7-day stage", () => {
    expect(scheduleReview("solved", 5, null, NOW).stage).toBe(2);
  });
  it("a confident re-solve lengthens the interval, an unsure one holds", () => {
    expect(scheduleReview("solved", 5, 2, NOW).stage).toBe(3);
    expect(scheduleReview("solved", 3, 2, NOW).stage).toBe(2);
  });
  it("caps at the longest interval", () => {
    expect(scheduleReview("solved", 5, 99, NOW).stage).toBe(REVIEW_INTERVALS.length - 1);
  });
});

describe("buildOverview", () => {
  it("is empty and safe with no data", () => {
    const ov = buildOverview([], [], NOW);
    expect(ov.overall).toBe(0);
    expect(ov.totalAttempts).toBe(0);
    expect(ov.patterns).toHaveLength(15);
    expect(ov.today.filter((t) => t.kind === "new")).toHaveLength(2);
  });

  it("scores a clean independent solve high and marks the pattern practiced", () => {
    const ov = buildOverview([mkProblem({ patterns: ["Graphs"] })], [], NOW);
    const g = ov.patterns.find((p) => p.pattern === "Graphs")!;
    expect(g.practiced).toBe(true);
    expect(g.independentSolves).toBe(1);
    expect(g.readiness).toBeGreaterThan(60);
  });

  it("counts a failure against the pattern and surfaces it in needsWork", () => {
    const ov = buildOverview([mkProblem({ patterns: ["Dynamic Programming"], result: "failed", hints_used: 3, solution_quality: "incorrect", confidence: 1 })], [], NOW);
    const dp = ov.patterns.find((p) => p.pattern === "Dynamic Programming")!;
    expect(dp.failed).toBe(1);
    expect(dp.readiness).toBeLessThan(30);
    expect(ov.needsWork.some((w) => w.pattern === "Dynamic Programming")).toBe(true);
  });
});

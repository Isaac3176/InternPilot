import { describe, it, expect } from "vitest";
import { analyzeOA } from "./oaDiagnostics";
import { topicToPattern } from "./patterns";
import type { OAAttempt, OAQuestion } from "../db/oaAttempts";

const q = (p: Partial<OAQuestion>): OAQuestion => ({
  attempted: true, solved: false, timeMin: null, difficulty: "medium", topic: null,
  testsPassed: null, problem: null, failureReason: null, ...p,
});
const attempt = (qs: OAQuestion[], duration = 75): OAAttempt => ({
  id: 1, application_id: null, company: "TikTok", role_title: "SWE", taken_on: "2026-08-16",
  duration_min: duration, num_questions: qs.length, questions: qs, primary_lesson: null,
  next_rule: null, topics_review: [], created_at: "2026-08-16",
});

describe("topicToPattern", () => {
  it("maps OA topics onto prep patterns", () => {
    expect(topicToPattern("simulation / state transitions")).toBe("Simulation / Implementation");
    expect(topicToPattern("graph bfs")).toBe("Graphs");
    expect(topicToPattern("dynamic programming")).toBe("Dynamic Programming");
  });
  it("returns null for an unrecognized topic", () => {
    expect(topicToPattern("interpretive dance")).toBeNull();
  });
});

describe("analyzeOA", () => {
  it("flags time management when one unsolved problem eats most of the clock", () => {
    const d = analyzeOA([attempt([q({ solved: true, timeMin: 25 }), q({ solved: false, timeMin: 50, topic: "simulation" })])])!;
    expect(d.worstTimeSinkPct).toBeCloseTo(50 / 75, 2);
    expect(d.weaknesses.some((w) => w.key === "time-management")).toBe(true);
    expect(d.recommendations.some((r) => /timed assessments/.test(r))).toBe(true);
  });

  it("is low-confidence with a single attempt", () => {
    const d = analyzeOA([attempt([q({ solved: true, timeMin: 20 })])])!;
    expect(d.lowConfidence).toBe(true);
  });

  it("returns null with no attempts", () => {
    expect(analyzeOA([])).toBeNull();
  });
});

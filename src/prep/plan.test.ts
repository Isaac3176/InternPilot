import { describe, it, expect } from "vitest";
import { buildOAPlan } from "./plan";
import { buildOverview } from "./engine";

const NOW = Date.UTC(2026, 7, 1);
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);
const OV = buildOverview([], [], NOW); // empty → falls back to core patterns

describe("buildOAPlan", () => {
  it("returns null for a past date", () => {
    expect(buildOAPlan("Datadog", null, inDays(-2), OV, [], NOW)).toBeNull();
  });

  it("builds a day-per-day plan ending on OA day, with a mid-plan simulation", () => {
    const plan = buildOAPlan("Datadog", "SWE Intern", inDays(6), OV, [], NOW)!;
    expect(plan.daysUntil).toBe(6);
    expect(plan.days).toHaveLength(7); // today .. OA day
    expect(plan.days[0].label).toBe("Today");
    expect(plan.days[plan.days.length - 1].label).toBe("OA day");
    expect(plan.days.some((d) => d.sim)).toBe(true);
  });

  it("puts company-specific weaknesses first and surfaces them as seenHere", () => {
    const plan = buildOAPlan("Datadog", null, inDays(5), OV, ["Graphs"], NOW)!;
    expect(plan.seenHere).toEqual(["Graphs"]);
    // A practice day should mention Graphs before the generic fallback patterns.
    const practiceText = plan.days.flatMap((d) => d.tasks).join(" ");
    expect(practiceText).toContain("Graphs");
  });
});

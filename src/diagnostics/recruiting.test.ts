import { describe, it, expect } from "vitest";
import { reachedRank, computeDiagnostics } from "./recruiting";
import type { ApplicationRow } from "../db/types";

const NOW = Date.UTC(2026, 7, 20);
const mkApp = (p: Partial<ApplicationRow>): ApplicationRow => ({
  id: 1, company_id: null, role_title: "SWE", job_link: null, location: null,
  status: "applied", date_saved: "2026-08-01", date_applied: "2026-08-01",
  resume_version_id: null, job_description: null, notes: null, referral: null,
  created_at: "2026-08-01", company_name: "Acme", resume_version_name: null, ...p,
} as ApplicationRow);

describe("reachedRank", () => {
  it("uses the deepest stage, surviving a later rejection", () => {
    expect(reachedRank(mkApp({ status: "applied" }))).toBe(1);
    expect(reachedRank(mkApp({ status: "rejected", furthest_stage: "interview" }))).toBe(3);
    expect(reachedRank(mkApp({ status: "rejected", furthest_stage: null, date_applied: "2026-08-01" }))).toBe(1);
    expect(reachedRank(mkApp({ status: "interested", date_applied: null }))).toBe(0);
  });
});

describe("computeDiagnostics", () => {
  it("counts an instant rejection into the <1h auto-screen bucket", () => {
    const apps = [mkApp({ status: "rejected", applied_at: "2026-08-10T09:00:00Z", result_date: "2026-08-10T09:30:00Z", furthest_stage: "applied" })];
    const d = computeDiagnostics(apps, NOW);
    const lt1h = d.rejection.buckets.find((b) => b.label === "< 1 hour")!;
    expect(lt1h.count).toBe(1);
    expect(d.rejection.dated).toBe(1);
  });

  it("treats a negative delta as undated, not an instant screen (regression)", () => {
    const apps = [mkApp({ status: "rejected", applied_at: "2026-08-10T09:00:00Z", result_date: "2026-08-09T09:00:00Z", furthest_stage: "applied" })];
    const d = computeDiagnostics(apps, NOW);
    expect(d.rejection.buckets.find((b) => b.label === "< 1 hour")!.count).toBe(0);
    expect(d.rejection.undated).toBe(1);
  });

  it("builds the funnel from furthest stage reached", () => {
    const apps = [
      mkApp({ id: 1, status: "applied", furthest_stage: "applied" }),
      mkApp({ id: 2, status: "rejected", furthest_stage: "oa" }),
      mkApp({ id: 3, status: "offer", furthest_stage: "offer" }),
    ];
    const d = computeDiagnostics(apps, NOW);
    expect(d.funnel.find((s) => s.key === "applied")!.count).toBe(3);
    expect(d.funnel.find((s) => s.key === "oa")!.count).toBe(2);
    expect(d.funnel.find((s) => s.key === "offer")!.count).toBe(1);
  });
});

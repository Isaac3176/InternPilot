import { describe, it, expect } from "vitest";
import { screeningItems, fastRejections } from "./questionAudit";
import type { ApplicationRow, Profile } from "../db/types";

const profile = (p: Partial<Profile>): Profile => ({ id: 1, ...p } as Profile);
const mkApp = (p: Partial<ApplicationRow>): ApplicationRow => ({
  id: 1, company_id: null, role_title: "SWE", job_link: null, location: null,
  status: "rejected", date_saved: "2026-08-01", date_applied: "2026-08-01",
  resume_version_id: null, job_description: null, notes: null, referral: null,
  created_at: "2026-08-01", company_name: "Acme", resume_version_name: null, ...p,
} as ApplicationRow);

describe("screeningItems", () => {
  it("flags a sponsorship requirement as an auto-screen risk", () => {
    const items = screeningItems(profile({ requires_sponsorship: "Yes" }));
    const s = items.find((i) => i.category === "sponsorship")!;
    expect(s.risk).toBe(true);
  });
  it("does not flag when no sponsorship is needed", () => {
    const items = screeningItems(profile({ requires_sponsorship: "No" }));
    expect(items.find((i) => i.category === "sponsorship")!.risk).toBe(false);
  });
  it("flags a sub-3.0 GPA", () => {
    expect(screeningItems(profile({ gpa: "2.8" })).find((i) => i.category === "gpa")!.risk).toBe(true);
    expect(screeningItems(profile({ gpa: "3.6" })).find((i) => i.category === "gpa")!.risk).toBe(false);
  });
  it("returns nothing for a null profile", () => {
    expect(screeningItems(null)).toEqual([]);
  });
});

describe("fastRejections", () => {
  it("flags a rejection that lands within the hour as very likely automated", () => {
    const apps = [mkApp({ applied_at: "2026-08-10T09:00:00Z", result_date: "2026-08-10T09:37:00Z" })];
    const fr = fastRejections(apps, profile({ requires_sponsorship: "Yes" }));
    expect(fr).toHaveLength(1);
    expect(fr[0].likelihood).toBe("very likely");
    expect(fr[0].items.some((i) => i.category === "sponsorship" && i.risk)).toBe(true);
  });

  it("ignores a rejection that took a week", () => {
    const apps = [mkApp({ applied_at: "2026-08-01T09:00:00Z", result_date: "2026-08-08T09:00:00Z" })];
    expect(fastRejections(apps, null)).toHaveLength(0);
  });

  it("ignores a non-rejected application", () => {
    const apps = [mkApp({ status: "applied", applied_at: "2026-08-10T09:00:00Z", result_date: "2026-08-10T09:10:00Z" })];
    expect(fastRejections(apps, null)).toHaveLength(0);
  });
});

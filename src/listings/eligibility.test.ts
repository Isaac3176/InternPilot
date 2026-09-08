import { describe, it, expect } from "vitest";
import { assessEligibility } from "./eligibility";
import type { Profile } from "../db/types";
import type { Listing } from "./types";

const profile = (p: Partial<Profile>): Profile => ({ id: 1, ...p } as Profile);
const listing = (p: Partial<Listing>): Listing => ({
  id: "x", company: "Acme", title: "SWE Intern", url: "", locations: [], source: "test", ...p,
});

describe("assessEligibility", () => {
  it("is unknown until work authorization is set", () => {
    expect(assessEligibility(null, listing({})).level).toBe("unknown");
    expect(assessEligibility(profile({ work_auth: null }), listing({})).level).toBe("unknown");
  });

  it("clears a citizen for a citizenship-required role", () => {
    const r = assessEligibility(profile({ work_auth: "us_citizen" }), listing({ sponsorship: "U.S. citizenship required" }));
    expect(r.level).toBe("eligible");
  });

  it("rejects a non-citizen for a citizenship-required role", () => {
    const r = assessEligibility(profile({ work_auth: "f1_opt", requires_sponsorship: "Yes" }), listing({ sponsorship: "Must be a U.S. citizen" }));
    expect(r.level).toBe("ineligible");
  });

  it("flags 'no sponsorship' postings for review when the user needs sponsorship", () => {
    const r = assessEligibility(profile({ work_auth: "f1_opt", requires_sponsorship: "Yes" }), listing({ sponsorship: "Does not offer visa sponsorship" }));
    expect(r.level).toBe("review");
  });

  it("clears a citizen with no stated barriers", () => {
    expect(assessEligibility(profile({ work_auth: "us_citizen" }), listing({})).level).toBe("eligible");
  });

  it("marks a clearance-required role ineligible only when the user said they have none", () => {
    const r = assessEligibility(profile({ work_auth: "us_citizen", security_clearance: "No" }), listing({}), "Active security clearance required.");
    expect(r.level).toBe("ineligible");
  });

  // --- answer-driven behavior (the fix) ---

  it("uses the user's 'authorized' answer even without a work_auth enum value", () => {
    const r = assessEligibility(profile({ authorized_us: "Yes", requires_sponsorship: "No" }), listing({}));
    expect(r.level).toBe("eligible");
  });

  it("is unknown only when NO auth question was answered", () => {
    expect(assessEligibility(profile({ authorized_us: "Yes" }), listing({})).level).not.toBe("unknown");
    expect(assessEligibility(profile({}), listing({})).level).toBe("unknown");
  });

  it("softens a citizenship-required role to review (not ineligible) when citizenship is unstated but the user is authorized", () => {
    const r = assessEligibility(profile({ authorized_us: "Yes", requires_sponsorship: "No" }), listing({ sponsorship: "U.S. citizenship required" }));
    expect(r.level).toBe("review");
  });

  it("softens a clearance-required role to review when clearance is unstated", () => {
    const r = assessEligibility(profile({ authorized_us: "Yes" }), listing({}), "Active security clearance required.");
    expect(r.level).toBe("review");
  });
});

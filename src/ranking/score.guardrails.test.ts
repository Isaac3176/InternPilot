import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../db/types";
import type { RankedListing } from "../listings/types";
import type { RankingPrefs } from "./prefs";
import { installMemoryStorage } from "../test/storage";
import { scoreOpportunity } from "./score";

vi.mock("../cloud/userSettings", () => ({
  mirrorLocalSetting: vi.fn(),
  removeMirroredLocalSetting: vi.fn(),
}));

const prefs: RankingPrefs = {
  graduationYear: 2028,
  employmentTypes: ["internship"],
  targetSeason: "Summer 2027",
  targetRoles: ["Software Engineer Intern"],
  blockedRoles: ["Product Manager"],
  freshnessDays: 14,
  instantMin: 85,
  standardMin: 70,
  digestMin: 55,
  maxInstantPerDay: 8,
  quietStart: 22,
  quietEnd: 8,
};

const profile = (patch: Partial<Profile> = {}): Profile => ({
  id: 1,
  work_auth: "us_citizen",
  authorized_us: "Yes",
  requires_sponsorship: "No",
  security_clearance: "No",
  locations: "United States",
  remote_pref: "any",
  ...patch,
} as Profile);

function listing(id: string, patch: Partial<RankedListing>): RankedListing {
  return {
    id,
    company: "Acme",
    title: "Software Engineering Intern",
    url: `https://example.test/${id}`,
    locations: ["Austin, TX"],
    source: "test",
    score: 80,
    isNew: true,
    matchesRoles: true,
    sponsorshipOk: true,
    datePosted: 1_800_000_000,
    firstSeen: 1_800_000_000,
    ...patch,
  };
}

function score(l: RankedListing, p: Profile | null = profile()) {
  return scoreOpportunity(l, {
    profile: p,
    prefs,
    contactCompanies: new Set(),
    trackedUrls: new Set(),
    now: 1_800_000_000_000,
  });
}

describe("opportunity hard-filter guardrails", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("hides citizenship-required roles for non-citizens", () => {
    const o = score(
      listing("citizen", { sponsorship: "U.S. citizenship required" }),
      profile({ work_auth: "f1_opt", requires_sponsorship: "Yes" }),
    );

    expect(o.hidden).toBe(true);
    expect(o.hiddenReason).toBe("U.S. citizenship required");
    expect(o.tier).toBe("muted");
  });

  it("hides clearance-required roles when the user has no clearance", () => {
    const o = score(listing("clearance", { title: "Software Engineering Intern - Active security clearance required" }));

    expect(o.hidden).toBe(true);
    expect(o.hiddenReason).toBe("Requires security clearance");
  });

  it("hides unpaid roles", () => {
    const o = score(listing("unpaid", { salary: "Unpaid internship" }));

    expect(o.hidden).toBe(true);
    expect(o.hiddenReason).toBe("Unpaid position");
  });

  it("hides already-applied roles from visible queues without muting the listing itself", () => {
    const l = listing("tracked", {});
    const o = scoreOpportunity(l, {
      profile: profile(),
      prefs,
      contactCompanies: new Set(),
      trackedUrls: new Set([l.url]),
      now: 1_800_000_000_000,
    });

    expect(o.alreadyApplied).toBe(true);
    expect(o.hidden).toBe(false);
  });

  it("hides blocked role families", () => {
    const o = score(listing("pm", { title: "Product Manager Intern" }));

    expect(o.hidden).toBe(true);
    expect(o.hiddenReason).toBe("Blocked role: Product Manager");
  });
});

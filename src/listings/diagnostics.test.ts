import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "../ranking/prefs";
import { buildFeedDiagnostics } from "./diagnostics";
import type { Listing } from "./types";
import type { Profile } from "../db/types";

const baseListing = {
  company: "Example",
  url: "https://example.test/job",
  locations: ["New York, NY"],
  season: "Summer 2027",
  seasonInferred: false,
  source: "test",
} satisfies Omit<Listing, "id" | "title">;

function listing(id: string, title: string, overrides: Partial<Listing> = {}): Listing {
  return {
    ...baseListing,
    id,
    title,
    ...overrides,
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    current_city: null,
    current_state: null,
    current_country: "United States",
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    school: null,
    degree: "Bachelor's",
    major: null,
    minor: null,
    gpa: null,
    graduation_date: null,
    grad_year: null,
    target_roles: "Software Engineer",
    locations: "United States",
    skills: null,
    remote_pref: "any",
    preferred_resume_id: null,
    desired_salary: null,
    willing_to_relocate: null,
    earliest_start_date: null,
    target_date: null,
    work_auth: "us_citizen",
    authorized_us: null,
    requires_sponsorship: null,
    security_clearance: null,
    gender: null,
    race_ethnicity: null,
    hispanic_latino: null,
    veteran_status: null,
    disability_status: null,
    onboarded: 1,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildFeedDiagnostics", () => {
  it("counts the filter funnel using the same hard-filter order as the feed", () => {
    const result = buildFeedDiagnostics(
      [
        listing("keep", "Software Engineer Intern"),
        listing("type", "Software Engineer New Grad"),
        listing("senior", "Senior Software Engineer Intern"),
        listing("role", "Product Design Intern"),
        listing("location", "Software Engineer Intern", { locations: ["Aarhus, Denmark"] }),
        listing("season-title", "Software Engineer Intern Fall 2027"),
        listing("degree", "PhD Software Engineer Intern"),
      ],
      profile(),
      {
        ...DEFAULT_PREFS,
        employmentTypes: ["internship"],
        targetRoles: ["Software Engineer"],
        targetSeason: "Summer 2027",
      },
    );

    expect(result.raw).toBe(7);
    expect(result.steps.map((step) => [step.key, step.count, step.removed])).toEqual([
      ["employment", 6, 1],
      ["seniority", 5, 1],
      ["roles", 4, 1],
      ["locations", 3, 1],
      ["season", 2, 1],
      ["degree", 1, 1],
    ]);
  });

  it("uses current country as the fallback location filter", () => {
    const result = buildFeedDiagnostics(
      [
        listing("us", "Software Engineer Intern", { locations: ["Boston, MA"] }),
        listing("uk", "Software Engineer Intern", { locations: ["London, United Kingdom"] }),
      ],
      profile({ locations: null, current_country: "United States" }),
      {
        ...DEFAULT_PREFS,
        employmentTypes: ["internship"],
        targetRoles: ["Software Engineer"],
        targetSeason: "Summer 2027",
      },
    );

    expect(result.filters.locations).toEqual(["united states"]);
    expect(result.steps.find((step) => step.key === "locations")?.count).toBe(1);
  });
});

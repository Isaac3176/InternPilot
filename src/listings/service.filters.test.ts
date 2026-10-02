import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Listing } from "./types";
import { installMemoryStorage } from "../test/storage";

const mockFetchAllListings = vi.hoisted(() => vi.fn<() => Promise<Listing[]>>());
const mockGetProfile = vi.hoisted(() => vi.fn());

vi.mock("./sources", () => ({
  fetchAllListings: mockFetchAllListings,
}));

vi.mock("../db/profile", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("../cloud/userSettings", () => ({
  mirrorLocalSetting: vi.fn(),
}));

import { getFeed } from "./service";

function listing(id: string, patch: Partial<Listing>): Listing {
  return {
    id,
    company: "Acme",
    title: "Software Engineering Intern",
    url: `https://example.test/${id}`,
    locations: ["Austin, TX"],
    datePosted: 1_800_000_000,
    firstSeen: 1_800_000_000,
    season: "Summer 2027",
    seasonInferred: false,
    source: "test",
    ...patch,
  };
}

describe("feed hard filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryStorage();
    localStorage.setItem("internpilot.ranking.prefs", JSON.stringify({
      employmentTypes: ["internship"],
      targetSeason: "Summer 2027",
      targetRoles: ["Software Engineer Intern"],
    }));
    mockGetProfile.mockResolvedValue({
      degree: "Bachelor's",
      target_roles: "Software Engineer Intern",
      locations: "United States",
      current_country: null,
      skills: null,
      remote_pref: "any",
      work_auth: null,
    });
  });

  it("drops wrong-year and wrong-season roles", async () => {
    mockFetchAllListings.mockResolvedValue([
      listing("summer-2027", {}),
      listing("summer-2026", { title: "Software Engineering Intern - 2026", season: "Summer 2026" }),
      listing("fall-2027", { title: "Fall 2027 Software Engineering Intern", season: "Fall 2027" }),
    ]);

    const feed = await getFeed(true);

    expect(feed.listings.map((l) => l.id)).toEqual(["summer-2027"]);
  });

  it("drops graduate-only roles for undergrad profiles", async () => {
    mockFetchAllListings.mockResolvedValue([
      listing("undergrad", { title: "Software Engineering Intern" }),
      listing("phd", { title: "PhD Research Intern, Software Systems" }),
      listing("masters", { title: "Master's Software Engineering Intern" }),
    ]);

    const feed = await getFeed(true);

    expect(feed.listings.map((l) => l.id)).toEqual(["undergrad"]);
  });

  it("drops senior-level postings for early-career searches", async () => {
    mockFetchAllListings.mockResolvedValue([
      listing("intern", { title: "Software Engineering Intern" }),
      listing("senior", { title: "Senior Software Engineer Intern" }),
      listing("staff", { title: "Staff Platform Engineer Intern" }),
    ]);

    const feed = await getFeed(true);

    expect(feed.listings.map((l) => l.id)).toEqual(["intern"]);
  });

  it("respects selected employment type", async () => {
    mockFetchAllListings.mockResolvedValue([
      listing("intern", { title: "Software Engineering Intern" }),
      listing("new-grad", { title: "New Grad Software Engineer" }),
      listing("coop", { title: "Software Engineering Co-op" }),
    ]);

    const feed = await getFeed(true);

    expect(feed.listings.map((l) => l.id)).toEqual(["intern"]);
  });
});

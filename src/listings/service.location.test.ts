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

function listing(id: string, location: string): Listing {
  return {
    id,
    company: id,
    title: "Software Engineering Intern",
    url: `https://example.test/${id}`,
    locations: [location],
    datePosted: 1_800_000_000,
    firstSeen: 1_800_000_000,
    season: "Summer 2027",
    seasonInferred: false,
    source: "test",
  };
}

describe("feed location filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryStorage();
    localStorage.setItem("internpilot.ranking.prefs", JSON.stringify({
      employmentTypes: ["internship"],
      targetSeason: "Summer 2027",
      targetRoles: ["Software Engineer Intern"],
    }));
  });

  it("keeps Fast Apply/feed listings inside the user's United States preference", async () => {
    mockGetProfile.mockResolvedValue({
      degree: "Bachelor's",
      target_roles: "Software Engineer Intern",
      locations: "United States",
      current_country: null,
      skills: null,
      remote_pref: "any",
      work_auth: null,
    });
    mockFetchAllListings.mockResolvedValue([
      listing("databricks-aarhus", "Aarhus, Denmark"),
      listing("datadog-boston", "Boston, Massachusetts, USA"),
      listing("nvidia-santa-clara", "US, CA, Santa Clara"),
      listing("databricks-london", "London, United Kingdom"),
    ]);

    const feed = await getFeed(true);

    expect(feed.listings.map((l) => l.id)).toEqual(["datadog-boston", "nvidia-santa-clara"]);
  });

  it("falls back to current_country when preferred locations are empty", async () => {
    mockGetProfile.mockResolvedValue({
      degree: "Bachelor's",
      target_roles: "Software Engineer Intern",
      locations: "",
      current_country: "United States",
      skills: null,
      remote_pref: "any",
      work_auth: null,
    });
    mockFetchAllListings.mockResolvedValue([
      listing("remote-us", "Remote in USA"),
      listing("berlin", "Berlin, Germany"),
    ]);

    const feed = await getFeed(true);

    expect(feed.listings.map((l) => l.id)).toEqual(["remote-us"]);
  });
});

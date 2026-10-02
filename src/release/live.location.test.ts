import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AtsPosting } from "./ats";
import { installMemoryStorage } from "../test/storage";

const mockFetchCompanyPostings = vi.hoisted(() => vi.fn<(company: string) => Promise<AtsPosting[] | null>>());
const mockGetWatchlist = vi.hoisted(() => vi.fn());
const mockGetProfile = vi.hoisted(() => vi.fn());

vi.mock("./ats", () => ({
  fetchCompanyPostings: mockFetchCompanyPostings,
}));

vi.mock("../ranking/companies", () => ({
  getWatchlist: mockGetWatchlist,
}));

vi.mock("../db/profile", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("../lib/notify", () => ({
  notify: vi.fn(),
}));

vi.mock("../cloud/userSettings", () => ({
  mirrorLocalSetting: vi.fn(),
}));

import { detectLiveOpenings, getLiveOpenings } from "./live";

function posting(id: string, location: string): AtsPosting {
  return {
    id,
    title: "Software Engineering Intern",
    url: `https://example.test/${id}`,
    location,
    postedAt: 1_800_000_000,
  };
}

describe("live opening location filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryStorage();
    localStorage.setItem("internpilot.ranking.prefs", JSON.stringify({
      targetSeason: "Summer 2027",
    }));
    mockGetWatchlist.mockReturnValue([{ name: "Databricks", priority: "instant" }]);
    mockGetProfile.mockResolvedValue({
      degree: "Bachelor's",
      locations: "United States",
      current_country: null,
    });
  });

  it("drops non-US live ATS postings for a United States profile", async () => {
    mockFetchCompanyPostings.mockResolvedValue([
      posting("aarhus", "Aarhus, Denmark"),
      posting("boston", "Boston, Massachusetts, USA"),
      posting("berlin", "Berlin, Germany"),
    ]);

    const openings = await detectLiveOpenings({ markSeen: false });

    expect(openings.map((o) => o.location)).toEqual(["Boston, Massachusetts, USA"]);
  });

  it("filters cached live openings before rendering them", async () => {
    localStorage.setItem("internpilot.live.cache.v3", JSON.stringify({
      polledAt: Date.now(),
      openings: [
        { company: "Databricks", priority: "instant", title: "Software Engineering Intern", url: "https://example.test/aarhus", location: "Aarhus, Denmark", postedAt: 1_800_000_000, isNew: true },
        { company: "Nvidia", priority: "instant", title: "Software Engineering Intern", url: "https://example.test/santa-clara", location: "US, CA, Santa Clara", postedAt: 1_800_000_000, isNew: true },
      ],
    }));

    const openings = await getLiveOpenings();

    expect(mockFetchCompanyPostings).not.toHaveBeenCalled();
    expect(openings.map((o) => o.location)).toEqual(["US, CA, Santa Clara"]);
  });

  it("filters cached live openings by the current target season", async () => {
    localStorage.setItem("internpilot.live.cache.v3", JSON.stringify({
      polledAt: Date.now(),
      openings: [
        { company: "Databricks", priority: "instant", title: "Software Engineering Intern - 2026", url: "https://example.test/old", location: "US, CA, San Francisco", postedAt: 1_800_000_000, isNew: true },
        { company: "Nvidia", priority: "instant", title: "NVIDIA 2027 Internships: Software Engineering", url: "https://example.test/current", location: "US, CA, Santa Clara", postedAt: 1_800_000_000, isNew: true },
      ],
    }));

    const openings = await getLiveOpenings();

    expect(mockFetchCompanyPostings).not.toHaveBeenCalled();
    expect(openings.map((o) => o.url)).toEqual(["https://example.test/current"]);
  });

  it("filters cached graduate-only live openings for undergrad profiles", async () => {
    localStorage.setItem("internpilot.live.cache.v3", JSON.stringify({
      polledAt: Date.now(),
      openings: [
        { company: "Nvidia", priority: "instant", title: "NVIDIA 2027 Internships: Ph.D. Research Robotics", url: "https://example.test/phd", location: "US, CA, Santa Clara", postedAt: 1_800_000_000, isNew: true },
        { company: "Nvidia", priority: "instant", title: "NVIDIA 2027 Internships: Software Engineering", url: "https://example.test/swe", location: "US, CA, Santa Clara", postedAt: 1_800_000_000, isNew: true },
      ],
    }));

    const openings = await getLiveOpenings();

    expect(openings.map((o) => o.url)).toEqual(["https://example.test/swe"]);
  });

  it("uses onboarding locations when the profile has not loaded saved locations yet", async () => {
    mockGetProfile.mockResolvedValue({
      degree: "Bachelor's",
      locations: "",
      current_country: "",
    });
    localStorage.setItem("internpilot.onboarding.answers", JSON.stringify({
      locations: ["United States"],
    }));
    mockFetchCompanyPostings.mockResolvedValue([
      posting("aarhus", "Aarhus, Denmark"),
      posting("santa-clara", "US, CA, Santa Clara"),
    ]);

    const openings = await detectLiveOpenings({ markSeen: false });

    expect(openings.map((o) => o.location)).toEqual(["US, CA, Santa Clara"]);
  });
});

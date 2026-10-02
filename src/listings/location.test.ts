import { describe, expect, it } from "vitest";
import { matchesLocationFilter, matchesLocationPreferences } from "./location";

describe("location filtering", () => {
  it("matches United States against state abbreviations", () => {
    expect(matchesLocationFilter("United States", ["Austin, TX"])).toBe(true);
    expect(matchesLocationFilter("USA", ["Seattle, WA"])).toBe(true);
    expect(matchesLocationFilter("US", ["Washington, DC"])).toBe(true);
  });

  it("matches United States against USA wording and common city-only locations", () => {
    expect(matchesLocationFilter("United States", ["Remote in USA"])).toBe(true);
    expect(matchesLocationFilter("United States", ["San Francisco Bay Area"])).toBe(true);
    expect(matchesLocationFilter("United States", ["Los Angeles"])).toBe(true);
  });

  it("does not treat non-US locations as United States matches", () => {
    expect(matchesLocationFilter("United States", ["Toronto"])).toBe(false);
    expect(matchesLocationFilter("United States", ["London"])).toBe(false);
    expect(matchesLocationFilter("United States", ["Aarhus, Denmark"])).toBe(false);
  });

  it("keeps ordinary substring filtering behavior", () => {
    expect(matchesLocationFilter("new york", ["New York, NY"])).toBe(true);
    expect(matchesLocationFilter("remote", ["Remote - Canada"], false)).toBe(true);
    expect(matchesLocationFilter("remote", [], true)).toBe(true);
  });

  it("matches profile location preferences against listing locations", () => {
    expect(matchesLocationPreferences(["United States"], ["Boston, Massachusetts, USA"])).toBe(true);
    expect(matchesLocationPreferences(["United States"], ["London, United Kingdom"])).toBe(false);
    expect(matchesLocationPreferences(["United States"], ["Aarhus, Denmark"])).toBe(false);
    expect(matchesLocationPreferences([], ["London, United Kingdom"])).toBe(true);
  });
});

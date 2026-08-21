import { describe, it, expect } from "vitest";
import { isInternRole, matchesSeason, requiresGradDegree, isUndergradDegree, isRelevantOpening } from "./live";

describe("isInternRole", () => {
  it("keeps real early-career software roles", () => {
    expect(isInternRole("Software Engineering Intern, NCCL - 2026")).toBe(true);
    expect(isInternRole("Data Science Intern")).toBe(true);
    expect(isInternRole("New Grad Software Engineer")).toBe(true);
  });

  it("matches the PLURAL 'Internships' (regression for the dropped-postings bug)", () => {
    expect(isInternRole("NVIDIA 2027 Internships: Software Engineering")).toBe(true);
    expect(isInternRole("Data Science Interns")).toBe(true);
  });

  it("does NOT match 'internal' / 'international' substrings", () => {
    expect(isInternRole("Internal Audit Lead")).toBe(false);
    expect(isInternRole("International Sales Manager")).toBe(false);
  });

  it("excludes senior/manager even when 'intern' is present", () => {
    expect(isInternRole("Senior Software Engineer Intern")).toBe(false);
    expect(isInternRole("Solution Architect Manager - Intern Program")).toBe(false);
  });

  it("requires an engineering signal", () => {
    expect(isInternRole("Marketing Intern")).toBe(false);
    expect(isInternRole("Software Engineer Intern")).toBe(true);
  });
});

describe("matchesSeason", () => {
  it("keeps the target year and titles with no year", () => {
    expect(matchesSeason("NVIDIA 2027 Internships: Software Engineering", "Summer 2027")).toBe(true);
    expect(matchesSeason("Software Engineer Intern", "Summer 2027")).toBe(true);
  });
  it("drops a different year", () => {
    expect(matchesSeason("Software Engineering Intern, NCCL - 2026", "Summer 2027")).toBe(false);
    expect(matchesSeason("Summer 2025 SWE Intern", "Summer 2027")).toBe(false);
  });
  it("drops a conflicting season word", () => {
    expect(matchesSeason("Fall Software Engineering Intern", "Summer 2027")).toBe(false);
    expect(matchesSeason("Summer/Fall 2027 Intern", "Summer 2027")).toBe(true);
  });
});

describe("requiresGradDegree", () => {
  it("flags PhD / doctoral / master's roles", () => {
    expect(requiresGradDegree("PhD Research Intern, Generative AI")).toBe(true);
    expect(requiresGradDegree("NVIDIA 2027 Internships: Ph.D. Research Robotics")).toBe(true);
    expect(requiresGradDegree("Master's Software Engineering Intern")).toBe(true);
  });
  it("passes normal undergrad-friendly roles", () => {
    expect(requiresGradDegree("Software Engineering Intern")).toBe(false);
    expect(requiresGradDegree("NVIDIA 2027 Internships: Software Engineering")).toBe(false);
  });
});

describe("isUndergradDegree", () => {
  it("defaults to undergrad, and detects grad degrees", () => {
    expect(isUndergradDegree(null)).toBe(true);
    expect(isUndergradDegree("Bachelor of Science")).toBe(true);
    expect(isUndergradDegree("Master's")).toBe(false);
    expect(isUndergradDegree("PhD")).toBe(false);
  });
});

describe("isRelevantOpening (user-tailored)", () => {
  const undergrad = { targetSeason: "Summer 2027", undergrad: true };
  it("keeps a matching-season undergrad SWE intern role", () => {
    expect(isRelevantOpening("NVIDIA 2027 Internships: Software Engineering", undergrad)).toBe(true);
  });
  it("drops a PhD role for an undergrad", () => {
    expect(isRelevantOpening("NVIDIA 2027 Internships: Ph.D. Research Robotics", undergrad)).toBe(false);
  });
  it("drops a wrong-year role", () => {
    expect(isRelevantOpening("Software Engineering Intern, NCCL - 2026", undergrad)).toBe(false);
  });
  it("a grad user still sees PhD roles", () => {
    expect(isRelevantOpening("NVIDIA 2027 Internships: Ph.D. Research Robotics", { targetSeason: "Summer 2027", undergrad: false })).toBe(true);
  });
});

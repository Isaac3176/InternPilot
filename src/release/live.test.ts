import { describe, it, expect } from "vitest";
import { isInternRole } from "./live";

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

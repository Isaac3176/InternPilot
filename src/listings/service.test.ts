import { describe, expect, it } from "vitest";
import { matchesSeniority, matchesTargetRoles } from "./service";

const targetRoles = [
  "Software Engineer Intern",
  "Machine Learning Engineer Intern",
  "AI Engineer Intern",
];

describe("target role matching", () => {
  it("rejects senior-level postings for early-career searches", () => {
    expect(matchesSeniority("Senior Data Scientist Intern", ["internship"], targetRoles)).toBe(false);
    expect(matchesSeniority("Staff Software Engineer Intern", ["internship"], targetRoles)).toBe(false);
  });

  it("keeps matching early-career software and ML roles", () => {
    expect(matchesSeniority("Software Engineer Intern", ["internship"], targetRoles)).toBe(true);
    expect(matchesTargetRoles("Software Engineer Intern", targetRoles)).toBe(true);
    expect(matchesTargetRoles("Machine Learning Engineer Intern", targetRoles)).toBe(true);
  });

  it("does not treat data science as generic SWE unless the user targets data roles", () => {
    expect(matchesTargetRoles("Data Scientist Intern", targetRoles)).toBe(false);
    expect(matchesTargetRoles("Data Scientist Intern", ["Data Science Intern"])).toBe(true);
  });
});

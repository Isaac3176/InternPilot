import { describe, it, expect } from "vitest";
import { leadSentence, parseDuties } from "./parse";

describe("leadSentence", () => {
  it("pulls the first real sentence for the pull quote", () => {
    const text = "We are a fast-growing team building tools for developers. Join us for the ride.";
    expect(leadSentence(text)).toBe("We are a fast-growing team building tools for developers.");
  });

  it("strips a leading bullet marker", () => {
    expect(leadSentence("• We build products people love, every single day of the year.")).toBe(
      "We build products people love, every single day of the year.",
    );
  });

  it("returns empty for text too short to be a real lead", () => {
    expect(leadSentence("Hi there.")).toBe("");
  });
});

describe("parseDuties", () => {
  it("extracts bullets under a responsibilities heading", () => {
    const text = [
      "About the team",
      "We ship fast.",
      "",
      "What you'll do",
      "• Build product features with React and TypeScript.",
      "• Write tests for critical user workflows.",
      "• Collaborate with design on new experiences.",
      "",
      "Requirements",
      "• 3+ years of experience",
    ].join("\n");
    const duties = parseDuties(text);
    expect(duties).toEqual([
      "Build product features with React and TypeScript.",
      "Write tests for critical user workflows.",
      "Collaborate with design on new experiences.",
    ]);
  });

  it("stops at a requirements/qualifications heading", () => {
    const text = [
      "Responsibilities",
      "• Do the work.",
      "Qualifications",
      "• This should not be picked up as a duty.",
    ].join("\n");
    expect(parseDuties(text)).toEqual(["Do the work."]);
  });

  it("returns an empty list when there's no responsibilities section", () => {
    expect(parseDuties("Just a plain paragraph with no headings or bullets.")).toEqual([]);
  });
});

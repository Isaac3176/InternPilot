import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryStorage } from "../test/storage";

vi.mock("../cloud/userSettings", () => ({
  mirrorLocalSetting: vi.fn(),
}));

import { getAnswers, getReusableAnswers, matchAnswer } from "./answers";

const KEY = "internpilot.answers";

describe("getAnswers shape guard", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("drops entries with no usable id instead of returning them as-is", () => {
    localStorage.setItem(KEY, JSON.stringify([{ category: "Custom" }, null, "garbage", 42]));
    expect(getAnswers()).toEqual([]);
  });

  it("defaults missing fields on an otherwise-valid entry instead of leaving them undefined", () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: "a1", approved: true }]));
    const [a] = getAnswers();
    expect(a).toEqual({
      id: "a1", category: "Custom", question: "", answer: "", pattern: "",
      approved: true, lastReviewedAt: null,
    });
  });

  it("getReusableAnswers/matchAnswer don't throw on a malformed vault", () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: "a1", approved: true }, // no `answer` — previously crashed getReusableAnswers()
      { id: "a2", approved: true, answer: "I love building things.", pattern: "why.*company" },
    ]));
    expect(() => getReusableAnswers()).not.toThrow();
    expect(getReusableAnswers()).toHaveLength(1);
    expect(() => matchAnswer("Why do you want to work at this company?")).not.toThrow();
    expect(matchAnswer("Why do you want to work at this company?")?.id).toBe("a2");
  });

  it("keeps well-formed entries unchanged", () => {
    const entry = { id: "a1", category: "Motivation", question: "Why?", answer: "Because.", pattern: "why", approved: true, lastReviewedAt: "2026-01-01T00:00:00.000Z" };
    localStorage.setItem(KEY, JSON.stringify([entry]));
    expect(getAnswers()).toEqual([entry]);
  });
});

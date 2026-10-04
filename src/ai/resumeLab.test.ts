import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryStorage } from "../test/storage";

vi.mock("../cloud/userSettings", () => ({
  mirrorLocalSetting: vi.fn(),
}));

// OpenAI's `response_format: json_object` only guarantees syntactically valid
// JSON — it does not guarantee any particular key is present. These tests make
// sure a response that omits expected fields degrades to safe defaults instead
// of throwing when the page later does `result.rows.map(...)` etc.
function mockChatResponse(content: unknown) {
  vi.doMock("../lib/http", () => ({
    httpFetch: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
      text: async () => "",
    }),
  }));
}

describe("resumeLab AI result shape guards", () => {
  beforeEach(() => {
    installMemoryStorage();
    localStorage.setItem("internpilot.openai.apiKey", "sk-test");
    vi.resetModules();
  });

  it("gapFinder defaults rows/summary when the model omits them", async () => {
    mockChatResponse({}); // valid JSON, but missing every expected key
    const { gapFinder } = await import("./resumeLab");
    const result = await gapFinder("some resume text", "some JD text");
    expect(result.rows).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.source).toBe("openai");
  });

  it("gapFinder passes through a well-formed response unchanged", async () => {
    mockChatResponse({ rows: [{ item: "React", type: "keyword", have: "not on your résumé" }], summary: "1 gap found" });
    const { gapFinder } = await import("./resumeLab");
    const result = await gapFinder("some resume text", "some JD text");
    expect(result.rows).toHaveLength(1);
    expect(result.summary).toBe("1 gap found");
  });

  it("redFlagScan defaults every array/string field when the model omits them", async () => {
    mockChatResponse({ firstImpression: "Looks fine." }); // arrays missing entirely
    const { redFlagScan } = await import("./resumeLab");
    const result = await redFlagScan("some resume text");
    expect(result.firstImpression).toBe("Looks fine.");
    expect(result.skipReasons).toEqual([]);
    expect(result.cliches).toEqual([]);
    expect(result.fixes).toEqual([]);
  });
});

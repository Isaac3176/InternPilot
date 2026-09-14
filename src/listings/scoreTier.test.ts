import { describe, it, expect } from "vitest";
import { scoreTier } from "./scoreTier";

describe("scoreTier", () => {
  it("bands scores into good/accent/warn at the 80/65 cutoffs", () => {
    expect(scoreTier(100)).toBe("good");
    expect(scoreTier(80)).toBe("good");
    expect(scoreTier(79)).toBe("accent");
    expect(scoreTier(65)).toBe("accent");
    expect(scoreTier(64)).toBe("warn");
    expect(scoreTier(0)).toBe("warn");
  });
});

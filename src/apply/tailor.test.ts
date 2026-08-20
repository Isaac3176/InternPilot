import { describe, it, expect } from "vitest";
import { tailorForJob } from "./tailor";
import type { ResumeBullet } from "../db/types";

const bullet = (text: string, improved = true): ResumeBullet => ({
  id: Math.floor(text.length), experience_name: null,
  original_text: improved ? null : text, improved_text: improved ? text : null,
  tags: null, application_id: null, created_at: "2026-08-01",
});

describe("tailorForJob", () => {
  it("ranks bullets by the JD skills they cover", () => {
    const r = tailorForJob("We use React, TypeScript and Python.", [
      bullet("Built a React and TypeScript dashboard"),
      bullet("Wrote a small Python script"),
    ]);
    expect(r.leadWith[0].skills.length).toBeGreaterThanOrEqual(r.leadWith[1].skills.length);
    expect(r.leadWith[0].skills).toContain("React");
  });

  it("reports gaps no bullet covers", () => {
    const r = tailorForJob("Must know React and Kubernetes.", [bullet("Built a React app")]);
    expect(r.covered).toContain("React");
    expect(r.gaps).toContain("Kubernetes");
  });

  it("uses improved_text when present, else original_text", () => {
    const r = tailorForJob("Python role.", [bullet("Did Python work", false)]);
    expect(r.covered).toContain("Python");
  });

  it("handles a JD with no detectable skills", () => {
    const r = tailorForJob("A great cultural fit.", [bullet("Built things")]);
    expect(r.jdSkillCount).toBe(0);
    expect(r.leadWith).toHaveLength(0);
  });
});

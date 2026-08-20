import { defineConfig } from "vitest/config";

// Unit tests target the pure logic modules (diagnostics, prep engine, ATS filter,
// matching) — no DOM or Tauri needed, so the node environment is enough.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Report on the pure logic we can meaningfully test — exclude UI, DB, and
      // network layers (components, pages, db/*, cloud/*) that need a real runtime.
      include: ["src/prep/**", "src/diagnostics/**", "src/listings/match.ts", "src/listings/eligibility.ts", "src/apply/tailor.ts", "src/release/live.ts"],
      // AI/network modules need a real runtime, so they're out of scope here.
      exclude: ["**/*.test.ts", "src/prep/patterns.ts"],
    },
  },
});

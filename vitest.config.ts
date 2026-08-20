import { defineConfig } from "vitest/config";

// Unit tests target the pure logic modules (diagnostics, prep engine, ATS filter,
// matching) — no DOM or Tauri needed, so the node environment is enough.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

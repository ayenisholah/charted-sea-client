import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __VERSION__: JSON.stringify("0.0.0-live") },
  test: { include: ["test/**/*.live.test.ts"], testTimeout: 15 * 60_000 },
});

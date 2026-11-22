import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.live.test.ts"], testTimeout: 15 * 60_000 },
});

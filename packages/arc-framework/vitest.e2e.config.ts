import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["__tests__/e2e/**/*.test.ts"],
    globalSetup: ["__tests__/e2e/global-setup.ts"],
    testTimeout: 30_000,
    passWithNoTests: true,
  },
});

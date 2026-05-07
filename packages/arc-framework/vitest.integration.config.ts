import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["__tests__/integration/**/*.test.ts"],
    passWithNoTests: true,
  },
});

import { defineConfig } from "vitest/config";

// Single multi-project config so one `vitest run` executes every tier and prints
// one combined summary. Per-tier runs use `--project <name>` (see package.json).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          root: ".",
          include: ["__tests__/unit/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "integration",
          root: ".",
          include: ["__tests__/integration/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "e2e",
          root: ".",
          include: ["__tests__/e2e/**/*.test.ts"],
          globalSetup: ["__tests__/e2e/global-setup.ts"],
          testTimeout: 30_000,
          passWithNoTests: true,
        },
      },
    ],
  },
});

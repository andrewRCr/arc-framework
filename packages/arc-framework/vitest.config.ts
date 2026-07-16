import { configDefaults, defineConfig } from "vitest/config";

import { ISOLATED_UNIT_MOCK_FILES } from "./__tests__/helpers/isolated-unit-mock-files.js";

// Single multi-project config so one `vitest run` executes every tier and prints
// one combined summary. Per-tier runs use `--project <name>` (see package.json).
//
// The unit tier is split in two: `unit-mocks` runs the module-mocking files with
// per-file isolation, and `unit` runs everything else. The split keeps the
// mock-heavy files quarantined so the main tier can relax isolation for its
// import-cost win without their hoisted mocks leaking across file boundaries.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          root: ".",
          include: ["__tests__/unit/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...ISOLATED_UNIT_MOCK_FILES],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "unit-mocks",
          root: ".",
          include: [...ISOLATED_UNIT_MOCK_FILES],
          isolate: true,
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

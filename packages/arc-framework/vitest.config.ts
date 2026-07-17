import { configDefaults, defineConfig } from "vitest/config";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

import { ISOLATED_UNIT_MOCK_FILES } from "./__tests__/helpers/isolated-unit-mock-files.js";

// Git reports physical worktree paths while `os.tmpdir()` can retain a host
// alias (macOS `/var` vs `/private/var`). Give every temp fixture one canonical
// root so ordinary tests do not accidentally assert on two spellings of the
// same checkout; dedicated path-identity tests exercise the alias boundary.
const canonicalTempRoot = realpathSync(tmpdir());
if (process.platform === "win32") {
  process.env.TEMP = canonicalTempRoot;
  process.env.TMP = canonicalTempRoot;
} else {
  process.env.TMPDIR = canonicalTempRoot;
}

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
          // Module-mocking files are quarantined to the `unit-mocks` tier, so the
          // main unit tier can drop per-file isolation for its module-import win.
          isolate: false,
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

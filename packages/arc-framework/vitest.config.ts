import { configDefaults, defineConfig } from "vitest/config";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { ISOLATED_UNIT_MOCK_FILES } from "./__tests__/helpers/isolated-unit-mock-files.js";

// Absolute package root from this config file — not process.cwd(). `root: "."`
// resolves against the invoker's cwd, so `npx vitest --config …` from the monorepo
// root (or an IDE workspace root) finds zero tests under `__tests__/…`. Pinning
// here keeps include globs and globalSetup package-relative regardless of cwd.
// Supported entry remains `npm test` (workspaces set package cwd); this removes
// the silent empty-run failure mode when the config is pointed at directly.
const packageRoot = dirname(fileURLToPath(import.meta.url));

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

// Vitest sizes its worker pool from `availableParallelism() - 1`, which assumes the run
// owns the machine. That assumption fails everywhere this graph actually runs: CI schedules
// several jobs of it at once, and developer machines run parallel agent sessions whose
// quality gates coincide — in both cases concurrent runs each claiming all-but-one core
// oversubscribe the shared cores, surfacing as timing-sensitive test failures, stalls, and
// timeouts rather than as honest slowness. Cap the pool at a 50% share everywhere so two
// concurrent runs together fit the machine. The cap is a share rather than a count so it
// tracks the host's core count instead of pinning to one machine size, and
// `VITEST_MAX_WORKERS` overrides it so it can be retuned per-invocation without a code
// change.
const configuredWorkers = process.env["VITEST_MAX_WORKERS"] ?? "50%";
if (configuredWorkers !== undefined && !/^(?:[1-9]\d*|[1-9]\d?%|100%)$/u.test(configuredWorkers)) {
  throw new Error(
    `VITEST_MAX_WORKERS must be a positive integer or a percentage; received "${configuredWorkers}"`,
  );
}
const maxWorkers = configuredWorkers?.endsWith("%") === false
  ? Number(configuredWorkers)
  : configuredWorkers;

// Single multi-project config so one `vitest run` executes every tier and prints
// one combined summary. Per-tier runs use `--project <name>` (see package.json).
//
// The unit tier is split in two: `unit-mocks` runs the module-mocking files with
// per-file isolation, and `unit` runs everything else. The split keeps the
// mock-heavy files quarantined so the main tier can relax isolation for its
// import-cost win without their hoisted mocks leaking across file boundaries.
export default defineConfig({
  test: {
    ...(maxWorkers === undefined ? {} : { maxWorkers }),
    projects: [
      {
        test: {
          name: "unit",
          root: packageRoot,
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
          root: packageRoot,
          include: [...ISOLATED_UNIT_MOCK_FILES],
          isolate: true,
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "integration",
          root: packageRoot,
          include: ["__tests__/integration/**/*.test.ts"],
          globalSetup: ["__tests__/integration/global-setup.ts"],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "e2e",
          root: packageRoot,
          include: ["__tests__/e2e/**/*.test.ts"],
          globalSetup: ["__tests__/e2e/global-setup.ts"],
          testTimeout: 30_000,
          passWithNoTests: true,
        },
      },
    ],
  },
});

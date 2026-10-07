import { configDefaults, defineConfig } from "vitest/config";
import { HeavyFirstSequencer } from "./__tests__/helpers/heavy-first-sequencer.js";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { ISOLATED_UNIT_MOCK_FILES } from "./__tests__/helpers/isolated-unit-mock-files.js";
import { selectIntegrationTempRoot } from "./__tests__/helpers/integration-temp-root.js";
import { resolveVitestMaxWorkers } from "./__tests__/helpers/vitest-worker-policy.js";

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

// Integration fixtures are write-heavy and short-lived. Use Linux's memory-backed root
// only when it can execute the shims created by integration tests.
const integrationTempRoot = selectIntegrationTempRoot("/dev/shm");

// Test repositories must not inherit developer-machine Git configuration. A
// long-lived workstation can carry `arc.identity` globally even when a fixture
// intentionally omits the local key, while hosted runners usually cannot expose
// that leak. Keep every project on the same hermetic system/global baseline;
// fixtures install the local values they exercise explicitly.
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";

// Local quality gates share developer machines with parallel sessions and native child tools.
// Use half available parallelism with an eight-worker ceiling and one-worker floor. CI
// uses native sizing unless its workflow supplies an explicit capacity override.
// An empty CI override retains native sizing.
const maxWorkers = resolveVitestMaxWorkers(process.env);

// Single multi-project config so one `vitest run` executes every tier and prints
// one combined summary. Per-tier runs use `--project <name>` (see package.json).
//
// The unit tier is split in two: `unit-mocks` runs the module-mocking files with
// per-file isolation, and `unit` runs everything else. The split keeps the
// mock-heavy files quarantined so the main tier can relax isolation for its
// import-cost win without their hoisted mocks leaking across file boundaries.
export default defineConfig({
  test: {
    sequence: { sequencer: HeavyFirstSequencer },
    ...(maxWorkers === undefined ? {} : { maxWorkers }),
    projects: [
      {
        test: {
          name: "unit",
          runner: "__tests__/helpers/unit-process-runner.ts",
          root: packageRoot,
          setupFiles: ["__tests__/helpers/unit-setup.ts"],
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
          runner: "__tests__/helpers/unit-process-runner.ts",
          root: packageRoot,
          setupFiles: ["__tests__/helpers/unit-setup.ts"],
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
          ...(integrationTempRoot === undefined ? {} : { env: { TMPDIR: integrationTempRoot } }),
          globalSetup: ["__tests__/integration/global-setup.ts"],
          testTimeout: 30_000,
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

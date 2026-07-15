/**
 * Vitest global setup for E2E tests.
 *
 * Builds the CLI package once before any E2E test runs. All E2E tests invoke
 * the built `dist/cli.js` artifact as a subprocess — this setup ensures the
 * artifact exists and reflects the current source. `ARC_E2E_SKIP_BUILD=1`
 * skips the build for callers that already built the exact tree (CI jobs run
 * `npm run build` as their own step); the spawn helpers still fail fast with
 * a "build the CLI first" error if `dist/cli.js` is missing.
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function setup(): void {
  if (process.env.ARC_E2E_SKIP_BUILD === "1") return;
  const packageRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  execSync("npm run build", { cwd: packageRoot, stdio: "inherit" });
}

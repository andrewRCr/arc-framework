/**
 * Vitest global setup for E2E tests.
 *
 * Builds the CLI package once before any E2E test runs. All E2E tests invoke
 * the built `dist/cli.js` artifact as a subprocess — this setup ensures the
 * artifact exists and reflects the current source. The ordinary suite keeps
 * declaration generation as part of that proof; the dedicated focused script
 * uses the runtime-only build because its subprocesses consume only the bundle.
 * `ARC_E2E_SKIP_BUILD=1` skips either build for callers that already built the
 * exact tree (CI jobs download the shared full build); the spawn helpers still
 * fail fast with a "build the CLI first" error if `dist/cli.js` is missing. The
 * integration tier imposes the same expectation through its own setup, and the
 * variable gates both.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function selectE2EBuildCommand(lifecycleEvent: string | undefined): "npm run build" | "npm run build:fast" {
  return lifecycleEvent === "test:e2e:focused" ? "npm run build:fast" : "npm run build";
}

export function setup(): void {
  const packageRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  if (process.env.ARC_E2E_SKIP_BUILD !== "1") {
    execSync(selectE2EBuildCommand(process.env.npm_lifecycle_event), { cwd: packageRoot, stdio: "inherit" });
  }
  for (const artifact of ["dist/cli.js", "dist/schemas/kernel.json"]) {
    if (!existsSync(resolve(packageRoot, artifact))) {
      throw new Error(`${artifact} missing; build the CLI before running E2E tests`);
    }
  }
}

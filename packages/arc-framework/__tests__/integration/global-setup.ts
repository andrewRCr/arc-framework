/**
 * Vitest global setup for integration tests.
 *
 * Two suites in this tier spawn the built `dist/cli.js` as a subprocess, and a
 * stale bundle refuses every command — which would turn their exit-code and
 * stderr assertions into a refusal the failure output cannot explain. The
 * runtime-only build suffices: nothing in this tier reads declarations.
 * `ARC_E2E_SKIP_BUILD=1` skips it for callers that already built the exact tree
 * (CI downloads the shared dist artifact and sets it on this job); the spawn
 * helpers still fail fast with a "build the CLI first" error if `dist/cli.js`
 * is missing.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function setup(): void {
  const packageRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  if (process.env.ARC_E2E_SKIP_BUILD !== "1") {
    execSync("npm run build:fast", { cwd: packageRoot, stdio: "inherit" });
  }
  for (const artifact of ["dist/cli.js", "dist/schemas/kernel.json"]) {
    if (!existsSync(resolve(packageRoot, artifact))) {
      throw new Error(`${artifact} missing; build the CLI before running integration tests`);
    }
  }
}

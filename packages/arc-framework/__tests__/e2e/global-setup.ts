/**
 * Vitest global setup for E2E tests.
 *
 * Builds the CLI package once before any E2E test runs. All E2E tests invoke
 * the built `dist/cli.js` artifact as a subprocess — this setup ensures the
 * artifact exists and reflects the current source.
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function setup(): void {
  const packageRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  execSync("npm run build", { cwd: packageRoot, stdio: "inherit" });
}

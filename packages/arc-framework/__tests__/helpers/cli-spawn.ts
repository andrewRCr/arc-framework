/**
 * Shared subprocess-CLI primitives for test helpers.
 *
 * Resolves the absolute path to the built CLI entry point and exposes a
 * fail-fast precondition guard. Test helpers that spawn `node dist/cli.js`
 * (whether via pipe, PTY emulation, or any future mode) import from here so
 * the path constant and prebuild contract live in one place.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the built CLI entry point (`packages/arc-framework/dist/cli.js`). */
export const CLI_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../dist/cli.js",
);

/**
 * Throw a clear error if `dist/cli.js` is missing.
 *
 * E2E suites build the CLI automatically via the e2e config's `globalSetup`.
 * This guard catches the off-config invocation case (single-file vitest run
 * without `-c vitest.e2e.config.ts`, manually deleted `dist/`, or a future
 * subprocess test added under a non-e2e tier) so the failure surfaces as a
 * "build the CLI first" message instead of a confusing `MODULE_NOT_FOUND`
 * from the spawned `node`.
 */
export function assertCliBuilt(): void {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      `Built CLI not found at ${CLI_PATH}. ` +
        "Run `npm run build` first " +
        "(e2e suites build automatically via globalSetup).",
    );
  }
}

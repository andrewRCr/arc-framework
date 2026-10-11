/**
 * Shared subprocess-CLI primitives for test helpers.
 *
 * Resolves the absolute paths to the CLI's published entry point and its built
 * bundle, and exposes a fail-fast precondition guard. Test helpers that spawn
 * the CLI (whether via pipe, PTY emulation, or any future mode) import from
 * here so the path constants and prebuild contract live in one place.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Absolute path to the CLI's published entry point (`packages/arc-framework/bin/arc.js`), the file the
 * package's `arc` command runs. It loads the built bundle with Node's compile cache turned on.
 */
export const CLI_PATH = resolve(packageRoot, "bin/arc.js");

/** Absolute path to the built CLI bundle (`packages/arc-framework/dist/cli.js`) that the entry point loads. */
export const CLI_BUNDLE_PATH = resolve(packageRoot, "dist/cli.js");

/**
 * Throw a clear error if `dist/cli.js` is missing.
 *
 * E2E suites build the CLI automatically via the e2e project's `globalSetup`.
 * This guard catches the off-project invocation case (running outside the
 * `e2e` project, manually deleted `dist/`, or a future subprocess test added
 * under a non-e2e tier) so the failure surfaces as a "build the CLI first"
 * message instead of a confusing `MODULE_NOT_FOUND` from the spawned `node`.
 */
export function assertCliBuilt(): void {
  if (!existsSync(CLI_BUNDLE_PATH)) {
    throw new Error(
      `Built CLI not found at ${CLI_BUNDLE_PATH}. ` +
        "Run `npm run build` first " +
        "(e2e suites build automatically via globalSetup).",
    );
  }
}

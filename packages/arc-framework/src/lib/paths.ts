/**
 * Package-relative path resolution for bundled templates.
 *
 * Uses `import.meta.url` to locate the `arc/` and `templates/` directories
 * shipped alongside `dist/` in the published package. This works regardless
 * of where the package is installed because it resolves relative to the
 * compiled source file, not the user's working directory.
 *
 * Resolution walks up from the current file to find the nearest
 * `package.json`, which marks the package root. This works both in the
 * bundled output (`dist/cli.js`, one level deep) and in source
 * (`src/lib/paths.ts`, two levels deep).
 */

import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";

/**
 * Finds the package root by walking up from the current file until
 * a `package.json` is found.
 */
function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(resolve(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  throw new Error("Could not find package root from " + import.meta.url);
}

const packageRoot = findPackageRoot();

/**
 * Returns the absolute path to the bundled ARC template directory.
 *
 * @returns Absolute path to the bundled `arc/` template directory
 */
export function getArcTemplatePath(): string {
  return resolve(packageRoot, "arc");
}

/**
 * Returns the absolute path to the CLI-internal templates directory.
 *
 * @returns Absolute path to `templates/`
 */
export function getInternalTemplatePath(): string {
  return resolve(packageRoot, "templates");
}

/**
 * Returns the absolute path to the init recipe file.
 *
 * @returns Absolute path to `init-recipe.json`
 */
export function getRecipePath(): string {
  return resolve(packageRoot, "init-recipe.json");
}

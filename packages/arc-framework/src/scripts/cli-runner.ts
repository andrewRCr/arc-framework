/**
 * Shared runner for pre-commit hook scripts that take a list of staged paths,
 * validate them, and emit per-path diagnostics on stderr.
 *
 * Skips silently (exit 0) when argv is empty — the hook invokes scripts with
 * a filtered candidate list that may legitimately be empty after CHECK-side
 * pruning. Failures exit 1; clean runs exit 0 with no stdout output. Extra
 * dependencies (e.g., directory listings) bind via closure at the call site.
 *
 * @module
 */

import { readFileSync } from "node:fs";

/** Aggregate validator outcome consumed by {@link runPathListScript}. */
export interface PathListScriptResult {
  pass: boolean;
  diagnostics: string[];
}

/**
 * Run a path-list validator as a CLI entry. Reads `process.argv.slice(2)` for
 * staged paths, injects a `readFileSync` reader, writes diagnostics to stderr,
 * and exits with the appropriate status. Never returns.
 */
export function runPathListScript(
  validate: (
    paths: string[],
    readFile: (path: string) => string,
  ) => PathListScriptResult,
): never {
  const paths = process.argv.slice(2);
  if (paths.length === 0) process.exit(0);
  const result = validate(paths, (p) => readFileSync(p, "utf8"));
  if (!result.pass) {
    for (const d of result.diagnostics) {
      process.stderr.write(`${d}\n`);
    }
    process.exit(1);
  }
  process.exit(0);
}

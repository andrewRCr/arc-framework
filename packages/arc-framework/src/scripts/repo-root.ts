/**
 * Repository-root resolution for audit scripts.
 *
 * Audit scripts (`audit-method-triggers`, `audit-domain-rules`) operate on
 * the full corpus rooted at the repo root rather than on a list of staged
 * paths. This module's location anchors the relative-walk: it lives in the
 * same directory as the audit scripts, so the levels-up calculation is
 * shared.
 *
 * @module
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the repository root.
 *
 * This file lives at `<root>/packages/arc-framework/src/scripts/repo-root.ts`,
 * so the root is four levels up regardless of which audit script imports it.
 */
export function resolveRepoRoot(): string {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return resolve(scriptDir, "..", "..", "..", "..");
}

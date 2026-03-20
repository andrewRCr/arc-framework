/**
 * Identity resolution for ARC user directories.
 *
 * Resolves the developer's identity for `user/{identity}/` directory naming,
 * git notes refs, and session state paths. Lookup sequence:
 * 1. `git config arc.identity` (set during init)
 * 2. Slugified `git config user.name` (available in any git repo)
 * 3. Interactive prompt (if a prompt function is provided)
 *
 * The resolved identity is stored in `git config --local arc.identity` by the
 * caller (typically the init command).
 */

import { gitConfigGet } from "./exec.js";
import type { GitExec } from "./exec.js";

/**
 * Options for identity resolution.
 *
 * @param exec - Injectable git command executor
 * @param prompt - Optional interactive prompt function. Called when neither
 *   git config value is available. Receives a message and optional default.
 *   Return a string for the identity, or a Symbol to indicate cancellation.
 */
export interface IdentityOptions {
  exec: GitExec;
  prompt?: (message: string, defaultValue?: string) => Promise<string | symbol>;
}

/**
 * Convert a display name to a filesystem-safe identity slug.
 *
 * Lowercase, spaces and dots become hyphens, non-alphanumeric characters
 * stripped, consecutive hyphens collapsed, leading/trailing hyphens trimmed.
 *
 * @param name - Display name to slugify
 * @returns Filesystem-safe identity string
 */
export function slugifyIdentity(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve the developer's identity using the lookup sequence.
 *
 * Returns the identity string, or null if no identity could be determined
 * (no git config, no prompt function, or user cancelled the prompt).
 *
 * @param options - Resolution options (executor and optional prompt)
 * @returns Resolved identity string, or null
 */
export async function resolveIdentity(
  options: IdentityOptions,
): Promise<string | null> {
  // 1. Check existing arc.identity config
  const existing = await gitConfigGet(options.exec, "arc.identity");
  if (existing) {
    return existing;
  }

  // 2. Fall back to slugified user.name
  const userName = await gitConfigGet(options.exec, "user.name");
  const suggested = userName ? slugifyIdentity(userName) : undefined;

  // If we have a suggestion and no prompt function, use the suggestion directly
  if (suggested && !options.prompt) {
    return suggested;
  }

  // 3. Prompt if available
  if (options.prompt) {
    const result = await options.prompt(
      "What name should we use for your personal workspace?",
      suggested,
    );
    if (typeof result === "symbol") {
      return null;
    }
    return result;
  }

  return null;
}

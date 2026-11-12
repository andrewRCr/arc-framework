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
import { normalizeCommandIdentity } from "../command-input/identity.js";
import { SlugSchema, type Slug } from "../kernel/index.js";
import { UserFacingError } from "../errors.js";
import { normalizeGitRejection } from "./process-error.js";

function invalidConfiguredIdentity(): UserFacingError {
  return new UserFacingError({
    code: "identity.invalid",
    whatHappened: "Configured ARC identity is invalid",
    why: "arc.identity must be a lowercase alphanumeric slug whose segments are separated by single hyphens.",
    whatToDo: "Set a valid identity with:\n    git config --local arc.identity <identity>",
  });
}

/**
 * Read the configured ARC identity without normalization or fallback.
 *
 * @param exec - Injectable Git executor
 * @param cwd - Optional repository root to read configuration from
 * @returns A validated configured identity, or null when the key is absent
 * @throws The original non-absence Git failure or `identity.invalid` for a present invalid value
 */
export async function readConfiguredIdentity(exec: GitExec, cwd?: string): Promise<Slug | null> {
  const args = ["config", "--null", "--get", "arc.identity"];
  let stdout: string;
  try {
    ({ stdout } = cwd === undefined
      ? await exec("git", args)
      : await exec("git", args, { cwd }));
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    if (normalized.kind === "nonzero-exit" && normalized.exitCode === 1) return null;
    throw error;
  }

  const terminal = stdout.length - 1;
  if (terminal < 0 || stdout.charCodeAt(terminal) !== 0 || stdout.indexOf("\0") !== terminal) {
    throw invalidConfiguredIdentity();
  }
  const resolved = resolveIdentityFromValues({ arcIdentity: stdout.slice(0, terminal) });
  if (resolved.status !== "identified") throw invalidConfiguredIdentity();
  return resolved.identity;
}

/** What already-read `arc.identity` and `user.name` values yield by the identity rule. */
export type IdentityFromValues =
  | { readonly status: "identified"; readonly identity: Slug; readonly source: "arc.identity" | "user.name" }
  | { readonly status: "unset" }
  | { readonly status: "invalid" };

/**
 * Apply the identity rule to values already read: `arc.identity` validated where it is set, else `user.name`
 * slugified. Every reader of identity resolves through this one rule.
 *
 * @param values - `arc.identity` (null where it is set with no value) and `user.name`, each undefined where unset
 * @returns The identity and its source, or that none is set, or that `arc.identity` is invalid
 */
export function resolveIdentityFromValues(values: {
  readonly arcIdentity?: string | null; readonly userName?: string | null;
}): IdentityFromValues {
  if (values.arcIdentity !== undefined) {
    const parsed = SlugSchema.safeParse(values.arcIdentity);
    return parsed.success ? { status: "identified", identity: parsed.data, source: "arc.identity" } : { status: "invalid" };
  }
  const slug = SlugSchema.safeParse(values.userName ? slugifyIdentity(values.userName) : "");
  return slug.success ? { status: "identified", identity: slug.data, source: "user.name" } : { status: "unset" };
}

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
  return normalizeCommandIdentity(name) ?? "";
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
): Promise<Slug | null> {
  // 1. Check existing arc.identity config
  const existing = await readConfiguredIdentity(options.exec);
  if (existing !== null) return existing;

  // 2. Fall back to slugified user.name
  const fromName = resolveIdentityFromValues({ userName: await gitConfigGet(options.exec, "user.name") });
  const suggested = fromName.status === "identified" ? fromName.identity : undefined;

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
    const slugified = slugifyIdentity(typeof result === "string" ? result : "");
    return slugified === "" ? null : SlugSchema.parse(slugified);
  }

  return null;
}

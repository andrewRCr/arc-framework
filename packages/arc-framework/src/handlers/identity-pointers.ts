/** Configured identity and role pointers shared by composite status handlers. */

import {
  gitConfigGet,
  readConfiguredIdentity,
  type GitExec,
} from "../lib/git/index.js";

/** Normalize a `git config` readback — `undefined`, empty, and whitespace-only become `null`. */
export function normalizeGitConfigValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Read the configured identity and role pointers used by composite status handlers.
 *
 * Invalid configured identities remain actionable failures. Other identity-read
 * failures collapse to absence so the composite status envelope can report them.
 *
 * @param exec - Injectable Git executor
 * @returns Configured identity and normalized role pointers
 */
export async function readIdentityPointers(exec: GitExec): Promise<{
  identity: string | null;
  role: string | null;
}> {
  const [identity, roleRaw] = await Promise.all([
    readConfiguredIdentity(exec).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "identity.invalid") throw error;
      return null;
    }),
    gitConfigGet(exec, "arc.role"),
  ]);
  return {
    identity,
    role: normalizeGitConfigValue(roleRaw),
  };
}

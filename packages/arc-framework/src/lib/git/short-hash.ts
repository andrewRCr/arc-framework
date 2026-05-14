/**
 * Short-hash helper — resolves a full commit SHA to the user's preferred short
 * form via `git rev-parse --short`. Honors `core.abbrev` (default `auto` since
 * Git 2.11, which scales length to keep prefixes unambiguous in the local
 * object database) so display matches what Git and Git-aware editors show.
 *
 * Falls back to a 7-char slice when `git rev-parse` fails — covers mocked test
 * IO, remote-only hashes not present in the local object database, and empty
 * stdout. The fallback length matches Git's historical default abbrev.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

const FALLBACK_LENGTH = 7;

export async function shortHash(exec: GitExec, fullSha: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--short", fullSha]);
    const short = stdout.trim();
    if (short.length > 0) return short;
  } catch {
    // Fall through to slice fallback.
  }
  return fullSha.slice(0, FALLBACK_LENGTH);
}

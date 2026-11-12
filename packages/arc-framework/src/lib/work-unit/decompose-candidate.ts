/** Deterministic Git identity for a decomposition candidate. */

import { canonicalDigest } from "../kernel/canonical/canonical-json.js";

/** Return the single local branch reserved for an origin's decomposition candidate. */
export function decomposeCandidateBranch(origin: string): string {
  return `chore/decompose-${origin}`;
}

/** Return whether a branch occupies the reserved decomposition-candidate namespace. */
export function isDecomposeCandidateBranch(branch: string): boolean {
  return branch.startsWith("chore/decompose-") && branch.length > "chore/decompose-".length;
}

/** Return the stable directory token for an origin's decomposition candidate worktree. */
export function decomposeCandidateWorktreeToken(origin: string): string {
  return canonicalDigest({
    schemaVersion: 1,
    kind: "decomposition-candidate-worktree",
    origin,
  }).replace("sha256:", "sha256-");
}

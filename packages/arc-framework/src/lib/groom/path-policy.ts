/** Claimed-set write policy for one grooming generation. */

import { posix } from "node:path";

export interface GroomPathPolicyOptions {
  readonly members: readonly string[];
  readonly cohortPaths?: readonly string[];
  readonly derivedPaths?: readonly string[];
}

export type GroomPathPolicyResult =
  | { readonly kind: "allowed" }
  | { readonly kind: "refused"; readonly paths: readonly string[] };

/** Refuse every changed path outside the fixed member, named-cohort, and derived-view set. */
export function classifyGroomChangedPaths(
  changedPaths: readonly string[],
  options: GroomPathPolicyOptions,
): GroomPathPolicyResult {
  const members = new Set(options.members);
  const exactAllowed = new Set([
    ".arc/backlog/ROADMAP.md",
    ...(options.cohortPaths ?? []),
    ...(options.derivedPaths ?? []),
  ].map(normalize));
  const refused = changedPaths.map(normalize).filter((path) => {
    if (exactAllowed.has(path)) return false;
    const name = posix.basename(path);
    const match = /^(?:meta|draft)-(.+)\.md$/u.exec(name);
    if (match?.[1] === undefined || !members.has(match[1])) return true;
    return !(path.startsWith(".arc/backlog/planned/") || path.startsWith(".arc/backlog/provisional/"));
  });
  return refused.length === 0 ? { kind: "allowed" } : { kind: "refused", paths: refused };
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

/** Pure-routing changed-path policy for housekeeping review tails. */

export type HousekeepPathPolicyResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "refused"; readonly paths: readonly string[] };

/** Refuse repository riders outside backlog routing artifacts and the readiness view. */
export function classifyHousekeepChangedPaths(paths: readonly string[]): HousekeepPathPolicyResult {
  const refused = paths.filter((path) => !isRoutingPath(path));
  return refused.length === 0 ? { kind: "accepted" } : { kind: "refused", paths: refused };
}

function isRoutingPath(path: string): boolean {
  if (path === ".arc/backlog/ROADMAP.md") return true;
  return /^\.arc\/backlog\/(?:planned|provisional)\//u.test(path);
}

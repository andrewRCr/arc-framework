/** Git-backed revalidation of exact lifecycle-contribution entry identity. */

import type { GitExec } from "../git/exec.js";
import { readTreeEntry } from "../work-unit/git-decomposition-object-readers.js";
import {
  compareDeliveryLifecycleContribution,
  type DeliveryLifecycleTreeState,
} from "./lifecycle-contribution.js";

/** Closed result of one fresh lifecycle-contribution revalidation. */
export type DeliveryLifecycleContributionRevalidation =
  | { readonly status: "ok" }
  | {
      readonly status: "refused";
      readonly reason: "entry-unavailable" | "contribution-mismatch";
      readonly paths: readonly string[];
    };

/** Freshly compare protected-base and candidate tree entries at every supplied path. */
export async function revalidateDeliveryLifecycleContribution(input: {
  readonly exec: GitExec;
  readonly protectedBaseRef: string;
  readonly candidateRef: string;
  readonly paths: readonly string[];
}): Promise<DeliveryLifecycleContributionRevalidation> {
  const paths = [...new Set(input.paths)].sort(byteSort);
  const [protectedBase, candidate] = await Promise.all([
    readEntries(input.exec, input.protectedBaseRef, paths),
    readEntries(input.exec, input.candidateRef, paths),
  ]);
  const unavailable = paths.filter((path) => protectedBase.get(path) === false || candidate.get(path) === false);
  if (unavailable.length > 0) {
    return { status: "refused", reason: "entry-unavailable", paths: unavailable };
  }
  const comparison = compareDeliveryLifecycleContribution({
    paths,
    protectedBase: protectedBase as DeliveryLifecycleTreeState,
    candidate: candidate as DeliveryLifecycleTreeState,
  });
  return comparison.status === "match"
    ? { status: "ok" }
    : { status: "refused", reason: "contribution-mismatch", paths: comparison.mismatchedPaths };
}

async function readEntries(
  exec: GitExec,
  ref: string,
  paths: readonly string[],
): Promise<ReadonlyMap<string, Awaited<ReturnType<typeof readTreeEntry>>>> {
  const entries = await Promise.all(paths.map(async (path) => [path, await readTreeEntry(exec, ref, path)] as const));
  return new Map(entries);
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

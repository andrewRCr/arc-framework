/** Exact final-candidate containment for adopting a delivery chain beneath its originating branch. */

import type { RawGitExec } from "../change-facts.js";
import { normalizeGitRejection } from "../git/process-error.js";
import type { DeliveryContributionCoordinate } from "./contribution-proof.js";
import {
  compareNormalizedDeliveryTree,
  type DeliveryLifecycleTreeEntry,
  type DeliveryLifecycleTreeState,
} from "./lifecycle-contribution.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TREE_LINE = /^([0-7]{6}) ([^ ]+) ([0-9a-f]+)\t([\s\S]+)$/u;

async function verifyCoordinate(exec: RawGitExec, coordinate: DeliveryContributionCoordinate): Promise<boolean> {
  try {
    const [head, tree] = await Promise.all([
      exec(["rev-parse", "--verify", `${coordinate.head}^{commit}`], { objectAccess: "local-only" }),
      exec(["rev-parse", `${coordinate.head}^{tree}`], { objectAccess: "local-only" }),
    ]);
    return decoder.decode(head.stdout).trim() === coordinate.head
      && decoder.decode(tree.stdout).trim() === coordinate.tree;
  } catch {
    return false;
  }
}

async function readTree(exec: RawGitExec, tree: string): Promise<DeliveryLifecycleTreeState | null> {
  try {
    const result = await exec(["ls-tree", "--full-tree", "-r", "-z", tree], { objectAccess: "local-only" });
    const decoded = decoder.decode(result.stdout);
    if (decoded.length > 0 && !decoded.endsWith("\0")) return null;
    const entries = new Map<string, DeliveryLifecycleTreeEntry>();
    for (const record of decoded.split("\0").filter(Boolean)) {
      const match = TREE_LINE.exec(record);
      if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined || match[4] === undefined
        || !objectId.test(match[3]) || entries.has(match[4])) return null;
      entries.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
    }
    return entries;
  } catch {
    return null;
  }
}

async function classifyAncestry(
  exec: RawGitExec,
  ancestor: string,
  descendant: string,
): Promise<"ancestor" | "not-ancestor" | "unavailable"> {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    await exec(args, { objectAccess: "local-only" });
    return "ancestor";
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    return failure.kind === "nonzero-exit" && failure.exitCode === 1 ? "not-ancestor" : "unavailable";
  }
}

/** Exact coordinates and normalization paths classified before ancestry adoption. */
export interface DeliveryChainContainmentInput {
  readonly commonBase: DeliveryContributionCoordinate;
  readonly top: DeliveryContributionCoordinate;
  readonly highestMember: DeliveryContributionCoordinate;
  readonly finalCandidate: DeliveryContributionCoordinate;
  readonly lifecyclePaths: readonly string[];
}

/** Closed containment result for one final-candidate projection. */
export type DeliveryChainContainmentResult =
  | { readonly status: "contained" }
  | { readonly status: "refused"; readonly reason: "containment-diverged"; readonly paths: readonly string[] }
  | {
      readonly status: "refused";
      readonly reason: "containment-endpoints-unverified" | "containment-not-ancestral" | "git-failure";
    };

/**
 * Require the final candidate to descend from the adopted prefix and exactly normalize to the top.
 *
 * @param input - Exact delivery coordinates, lifecycle paths, and Git execution boundary
 * @returns A contained result or the exact structural refusal
 */
export async function classifyGitDeliveryChainContainment(
  input: DeliveryChainContainmentInput & { readonly exec: RawGitExec },
): Promise<DeliveryChainContainmentResult> {
  const coordinates = [input.commonBase, input.top, input.highestMember, input.finalCandidate];
  if (!(await Promise.all(coordinates.map(async (coordinate) => verifyCoordinate(input.exec, coordinate))))
    .every(Boolean)) return { status: "refused", reason: "containment-endpoints-unverified" };
  const ancestry = await classifyAncestry(input.exec, input.highestMember.head, input.finalCandidate.head);
  if (ancestry !== "ancestor") {
    return {
      status: "refused",
      reason: ancestry === "not-ancestor" ? "containment-not-ancestral" : "git-failure",
    };
  }
  const [protectedBase, top, finalCandidate] = await Promise.all([
    readTree(input.exec, input.commonBase.tree),
    readTree(input.exec, input.top.tree),
    readTree(input.exec, input.finalCandidate.tree),
  ]);
  if (protectedBase === null || top === null || finalCandidate === null) {
    return { status: "refused", reason: "git-failure" };
  }
  const comparison = compareNormalizedDeliveryTree({
    protectedBase,
    chainBase: protectedBase,
    top,
    finalCandidate,
    lifecyclePaths: input.lifecyclePaths,
    regenerablePaths: [],
  });
  if (comparison.status === "match") return { status: "contained" };
  return {
    status: "refused",
    reason: "containment-diverged",
    paths: [...new Set([
      ...comparison.droppedPaths,
      ...comparison.inventedPaths,
      ...comparison.mismatchedPaths,
    ])].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
  };
}

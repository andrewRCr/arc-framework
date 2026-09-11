/** Git-backed structural identity proof for one carried delivery member. */

import type { RawGitExec } from "../change-facts.js";
import { readMergeTreeComposition } from "../git/merge-tree.js";
import { normalizeGitRejection } from "../git/process-error.js";
import {
  compareDeliveryContribution,
  type DeliveryContributionCoordinate,
  type DeliveryContributionEndpoints,
  type DeliveryContributionProofResult,
} from "./contribution-proof.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function text(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes).trim();
  } catch {
    return null;
  }
}

async function verifyCoordinate(exec: RawGitExec, coordinate: DeliveryContributionCoordinate): Promise<boolean> {
  try {
    const [head, tree] = await Promise.all([
      exec(["rev-parse", "--verify", `${coordinate.head}^{commit}`], { objectAccess: "local-only" }),
      exec(["rev-parse", `${coordinate.head}^{tree}`], { objectAccess: "local-only" }),
    ]);
    return text(head.stdout) === coordinate.head && text(tree.stdout) === coordinate.tree;
  } catch {
    return false;
  }
}

function nulFields(bytes: Uint8Array): string[] | null {
  try {
    const decoded = decoder.decode(bytes);
    if (decoded.length > 0 && !decoded.endsWith("\0")) return null;
    return decoded.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

function pathList(bytes: Uint8Array): string[] | null {
  const fields = nulFields(bytes);
  return fields === null ? null : [...new Set(fields)].sort();
}

async function readAncestry(
  exec: RawGitExec,
  ancestor: string,
  descendant: string,
): Promise<"ancestor" | "not-ancestor" | null> {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    await exec(args, { objectAccess: "local-only" });
    return "ancestor";
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    return failure.kind === "nonzero-exit" && failure.exitCode === 1 ? "not-ancestor" : null;
  }
}

async function uniquePhysicalPredecessor(
  exec: RawGitExec,
  refreshedPredecessor: string,
  oldMember: string,
): Promise<DeliveryContributionCoordinate | null> {
  const args = ["merge-base", "--all", refreshedPredecessor, oldMember];
  try {
    const result = await exec(args, { objectAccess: "local-only" });
    const decoded = text(result.stdout);
    const boundaries = decoded === null
      ? []
      : [...new Set(decoded.split(/\s+/u).filter(Boolean))];
    const [head] = boundaries;
    if (boundaries.length !== 1 || head === undefined || !objectId.test(head)) return null;
    const treeResult = await exec(["rev-parse", `${head}^{tree}`], { objectAccess: "local-only" });
    const tree = text(treeResult.stdout);
    return tree !== null && objectId.test(tree) ? { head, tree } : null;
  } catch {
    return null;
  }
}

/** Reapply one pinned contribution and compare its structural result to the provider tree. */
export async function proveGitDeliveryContribution(input: DeliveryContributionEndpoints & {
  readonly exec: RawGitExec;
}): Promise<DeliveryContributionProofResult> {
  const coordinates = [
    input.before.predecessor, input.before.member, input.after.predecessor, input.after.member,
  ];
  if (!(await Promise.all(coordinates.map(async (coordinate) => verifyCoordinate(input.exec, coordinate))))
    .every(Boolean)) return { status: "refused", reason: "contribution-endpoints-unverified" };
  const comparison = compareDeliveryContribution({ before: input.before, after: input.after });
  if (comparison.status === "accepted") return comparison;
  const composition = await readMergeTreeComposition({
    exec: input.exec,
    mergeBase: input.before.predecessor.head,
    left: input.after.predecessor.head,
    right: input.before.member.head,
  });
  if (composition.state === "unavailable") {
    return composition.reason === "merge-tree-write-tree-unsupported"
      ? { status: "refused", reason: "merge-tree-write-tree-unsupported" }
      : { status: "refused", reason: "git-failure" };
  }
  if (composition.state === "conflict") {
    return { status: "refused", reason: "contribution-conflicted", paths: composition.paths };
  }
  const reappliedTree = composition.tree;
  try {
    if (reappliedTree === input.after.member.tree) {
      return { status: "accepted", proof: "mechanical-reapply" };
    }
    const difference = await input.exec([
      "diff", "--name-only", "-z", "--no-renames", reappliedTree, input.after.member.tree,
    ], { objectAccess: "local-only" });
    const paths = pathList(difference.stdout);
    return paths === null || paths.length === 0
      ? { status: "refused", reason: "git-failure" }
      : { status: "refused", reason: "contribution-diverged", paths };
  } catch {
    return { status: "refused", reason: "git-failure" };
  }
}

/** Prove one provider-refresh movement while retaining the ordinary contribution contract. */
export async function proveGitDeliveryProviderRefreshContribution(input: DeliveryContributionEndpoints & {
  readonly exec: RawGitExec;
}): Promise<DeliveryContributionProofResult> {
  const coordinates = [
    input.before.predecessor, input.before.member, input.after.predecessor, input.after.member,
  ];
  if (!(await Promise.all(coordinates.map(async (coordinate) => verifyCoordinate(input.exec, coordinate))))
    .every(Boolean)) return { status: "refused", reason: "contribution-endpoints-unverified" };
  const ancestry = await readAncestry(
    input.exec,
    input.before.predecessor.head,
    input.before.member.head,
  );
  if (ancestry === null) return { status: "refused", reason: "git-failure" };
  if (ancestry === "ancestor") return proveGitDeliveryContribution(input);
  const physicalPredecessor = await uniquePhysicalPredecessor(
    input.exec,
    input.after.predecessor.head,
    input.before.member.head,
  );
  if (physicalPredecessor === null) {
    return { status: "refused", reason: "contribution-endpoints-unverified" };
  }
  return proveGitDeliveryContribution({
    ...input,
    before: { ...input.before, predecessor: physicalPredecessor },
  });
}

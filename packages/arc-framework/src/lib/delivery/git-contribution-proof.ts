/** Git-backed structural identity proof for one carried delivery member. */

import type { RawGitExec } from "../change-facts.js";
import { supportsMergeTreeWriteTree } from "../git/merge-tree-capability.js";
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

function mergeTreeResult(bytes: Uint8Array): string | null {
  try {
    const first = decoder.decode(bytes).split(/[\0\n]/u)[0];
    return first !== undefined && objectId.test(first) ? first : null;
  } catch {
    return null;
  }
}

function pathList(bytes: Uint8Array): string[] | null {
  try {
    const decoded = decoder.decode(bytes);
    if (decoded.length > 0 && !decoded.endsWith("\0")) return null;
    return [...new Set(decoded.split("\0").filter(Boolean))].sort();
  } catch {
    return null;
  }
}

function conflictPaths(bytes: Uint8Array): string[] {
  const fields = pathList(bytes);
  if (fields === null) return [];
  return fields.filter((field) => !objectId.test(field));
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
  const comparison = compareDeliveryContribution(input);
  if (comparison.status === "accepted") return comparison;
  if (!await supportsMergeTreeWriteTree(input.exec)) {
    return { status: "refused", reason: "merge-tree-write-tree-unsupported" };
  }
  const mergeArgs = [
    "merge-tree",
    "--write-tree",
    "--merge-base", input.before.predecessor.head,
    "--name-only",
    "-z",
    "--no-messages",
    input.after.predecessor.head,
    input.before.member.head,
  ];
  try {
    const result = await input.exec(mergeArgs, { objectAccess: "local-only" });
    const reappliedTree = mergeTreeResult(result.stdout);
    if (reappliedTree === null) return { status: "refused", reason: "git-failure" };
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
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args: mergeArgs });
    if (failure.kind === "nonzero-exit" && failure.exitCode === 1) {
      return {
        status: "refused",
        reason: "contribution-conflicted",
        paths: conflictPaths(Buffer.from(failure.stdout, "latin1")),
      };
    }
    return { status: "refused", reason: "git-failure" };
  }
}

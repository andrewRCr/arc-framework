/** Git fact readers used by delivery eligibility without owning project gate execution. */

import type { GitExec } from "../git/exec.js";
import { readCommit, resolveCommit } from "../work-unit/git-decomposition-object-readers.js";
import {
  compareNormalizedDeliveryTree,
  type DeliveryLifecycleTreeEntry,
  type DeliveryLifecycleTreeState,
} from "./lifecycle-contribution.js";
import type { DeliveryEligibilityCoordinates } from "./eligibility.js";

const TREE_LINE = /^([0-7]{6}) ([^ ]+) ([0-9a-f]+)\t(.+)$/u;

/** Resolve one ref to exact commit and tree coordinates. */
export async function observeDeliveryEligibilityRef(
  exec: GitExec,
  ref: string,
): Promise<DeliveryEligibilityCoordinates | null> {
  const head = await resolveCommit(exec, ref);
  if (head === null) return null;
  const commit = await readCommit(exec, head);
  return commit === null ? null : { head: commit.head, tree: commit.tree };
}

/** Read every recursive leaf entry in one exact tree, preserving mode, type, and object identity. */
export async function readDeliveryEligibilityTree(
  exec: GitExec,
  ref: string,
): Promise<DeliveryLifecycleTreeState | null> {
  try {
    const { stdout } = await exec("git", ["ls-tree", "--full-tree", "-r", "-z", ref]);
    const entries = new Map<string, DeliveryLifecycleTreeEntry>();
    for (const record of stdout.split("\0").filter(Boolean)) {
      const match = TREE_LINE.exec(record);
      if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined || match[4] === undefined
        || entries.has(match[4])) return null;
      entries.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
    }
    return entries;
  } catch {
    return null;
  }
}

/** Inspect exact checkout coordinates and tracked/index dirt, excluding untracked and ignored build output. */
export async function inspectDeliveryCandidateCheckout(
  exec: GitExec,
  checkoutPath: string,
): Promise<(DeliveryEligibilityCoordinates & { readonly trackedDirty: boolean }) | null> {
  return inspectDeliveryCheckoutDirt(exec, checkoutPath, "no");
}

async function inspectDeliveryCheckoutDirt(
  exec: GitExec,
  checkoutPath: string,
  untrackedFiles: "no" | "all",
): Promise<(DeliveryEligibilityCoordinates & { readonly trackedDirty: boolean }) | null> {
  const coordinates = await observeDeliveryEligibilityRef(
    (command, args, options) => exec(command, args, { ...options, cwd: checkoutPath }),
    "HEAD",
  );
  if (coordinates === null) return null;
  try {
    const { stdout } = await exec(
      "git",
      ["status", "--porcelain=v1", "-z", `--untracked-files=${untrackedFiles}`],
      { cwd: checkoutPath },
    );
    return { ...coordinates, trackedDirty: stdout !== "" };
  } catch {
    return null;
  }
}

/**
 * Inspect mutable correction authoring coordinates and all tracked, index, and untracked residue.
 *
 * @param exec - Git execution boundary.
 * @param checkoutPath - Exact correction-authoring checkout path.
 * @returns Current coordinates and dirt state, or null when either cannot be observed.
 */
export async function inspectDeliveryAuthoringCheckout(
  exec: GitExec,
  checkoutPath: string,
): Promise<(DeliveryEligibilityCoordinates & { readonly trackedDirty: boolean }) | null> {
  return inspectDeliveryCheckoutDirt(exec, checkoutPath, "all");
}

/** Read and compare the normalized top and final-candidate trees. */
export async function compareGitNormalizedDeliveryTrees(input: {
  readonly exec: GitExec;
  readonly protectedBaseTree: string;
  readonly chainBaseTree: string;
  readonly topTree: string;
  readonly finalCandidateTree: string;
  readonly lifecyclePaths: readonly string[];
  readonly regenerablePaths: readonly string[];
}): Promise<ReturnType<typeof compareNormalizedDeliveryTree> | { readonly status: "unavailable" }> {
  const [protectedBase, chainBase, top, finalCandidate] = await Promise.all([
    readDeliveryEligibilityTree(input.exec, input.protectedBaseTree),
    readDeliveryEligibilityTree(input.exec, input.chainBaseTree),
    readDeliveryEligibilityTree(input.exec, input.topTree),
    readDeliveryEligibilityTree(input.exec, input.finalCandidateTree),
  ]);
  if (protectedBase === null || chainBase === null || top === null || finalCandidate === null) {
    return { status: "unavailable" };
  }
  return compareNormalizedDeliveryTree({
    protectedBase,
    chainBase,
    top,
    finalCandidate,
    lifecyclePaths: input.lifecyclePaths,
    regenerablePaths: input.regenerablePaths,
  });
}

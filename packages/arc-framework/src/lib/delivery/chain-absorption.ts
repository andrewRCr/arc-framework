/** Append-only content absorption for a refreshed delivery predecessor. */

import type { RawGitExec } from "../change-facts.js";
import type { DeliveryTerminalRemedy } from "./retirement.js";
import { supportsMergeTreeWriteTree } from "../git/merge-tree-capability.js";
import { normalizeGitRejection } from "../git/process-error.js";
import type { DeliveryContributionCoordinate } from "./contribution-proof.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function text(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes).trim();
  } catch {
    return null;
  }
}

async function observeCommit(exec: RawGitExec, ref: string): Promise<string | null> {
  try {
    const value = text((await exec(
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { objectAccess: "local-only" },
    )).stdout);
    return value !== null && objectId.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function coordinateMatches(
  exec: RawGitExec,
  coordinate: DeliveryContributionCoordinate,
): Promise<boolean> {
  const head = await observeCommit(exec, coordinate.head);
  if (head !== coordinate.head) return false;
  try {
    return text((await exec(
      ["rev-parse", `${coordinate.head}^{tree}`],
      { objectAccess: "local-only" },
    )).stdout) === coordinate.tree;
  } catch {
    return false;
  }
}

async function logicalBaseMatches(
  exec: RawGitExec,
  coordinate: { readonly head: string; readonly tree?: string },
): Promise<boolean> {
  return coordinate.tree === undefined
    ? await observeCommit(exec, coordinate.head) === coordinate.head
    : coordinateMatches(exec, { head: coordinate.head, tree: coordinate.tree });
}

async function mergeInProgress(exec: RawGitExec): Promise<boolean> {
  return await observeCommit(exec, "MERGE_HEAD") !== null;
}

function validTopRef(ref: string): boolean {
  return ref.startsWith("refs/heads/") && !ref.startsWith("refs/heads/delivery/")
    && !/[\0\r\n]/u.test(ref);
}

async function checkedOutRef(exec: RawGitExec): Promise<string | null> {
  try {
    return text((await exec(
      ["symbolic-ref", "-q", "HEAD"],
      { objectAccess: "local-only" },
    )).stdout);
  } catch {
    return null;
  }
}

async function statusText(exec: RawGitExec): Promise<string | null> {
  try {
    return text((await exec(
      ["status", "--porcelain=v1"],
      { objectAccess: "local-only" },
    )).stdout);
  } catch {
    return null;
  }
}

async function observeExactAbsorption(
  exec: RawGitExec,
  head: string,
  topHead: string,
  highestMemberHead: string,
): Promise<{ readonly head: string; readonly tree: string } | null> {
  try {
    const [tree, parentLine] = await Promise.all([
      exec(["rev-parse", `${head}^{tree}`], { objectAccess: "local-only" })
        .then(({ stdout }) => text(stdout)),
      exec(["rev-list", "--parents", "-n", "1", head], { objectAccess: "local-only" })
        .then(({ stdout }) => text(stdout)),
    ]);
    return tree !== null && parentLine === `${head} ${topHead} ${highestMemberHead}`
      ? { head, tree }
      : null;
  } catch {
    return null;
  }
}

async function unmergedPaths(exec: RawGitExec): Promise<string[] | null> {
  try {
    const value = decoder.decode((await exec(
      ["diff", "--name-only", "-z", "--diff-filter=U"],
      { objectAccess: "local-only" },
    )).stdout);
    if (value.length > 0 && !value.endsWith("\0")) return null;
    return [...new Set(value.split("\0").filter(Boolean))].sort();
  } catch {
    return null;
  }
}

function mergeTreeOutput(bytes: Uint8Array): {
  readonly tree: string;
  readonly paths: readonly string[];
} | null {
  try {
    const value = decoder.decode(bytes);
    if (value.length > 0 && !value.endsWith("\0")) return null;
    const [tree, ...paths] = value.split("\0").filter(Boolean);
    return tree !== undefined && objectId.test(tree)
      ? { tree, paths: [...new Set(paths)].sort() }
      : null;
  } catch {
    return null;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

async function changedTreePaths(
  exec: RawGitExec,
  before: string,
  after: string,
): Promise<readonly string[] | null> {
  try {
    const bytes = (await exec([
      "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "--no-renames", before, after,
    ], { objectAccess: "local-only" })).stdout;
    const value = decoder.decode(bytes);
    if (value.length > 0 && !value.endsWith("\0")) return null;
    return [...new Set(value.split("\0").filter(Boolean))].sort();
  } catch {
    return null;
  }
}

async function treeEntry(
  exec: RawGitExec,
  tree: string,
  path: string,
): Promise<Uint8Array | null> {
  try {
    return (await exec(
      ["ls-tree", "-z", tree, "--", `:(literal)${path}`],
      { objectAccess: "local-only" },
    )).stdout;
  } catch {
    return null;
  }
}

/**
 * Prove that every exact tree-entry change in the refreshed predecessor is already present in the top.
 * `null` means the proof could not be observed and therefore grants no content-neutral action.
 */
async function highestMovementIsContained(
  exec: RawGitExec,
  previousHighestMember: { readonly head: string; readonly tree?: string },
  highestMember: DeliveryContributionCoordinate,
  top: DeliveryContributionCoordinate,
): Promise<boolean | null> {
  const paths = await changedTreePaths(exec, previousHighestMember.head, highestMember.head);
  if (paths === null) return null;
  for (const path of paths) {
    const [highestEntry, topEntry] = await Promise.all([
      treeEntry(exec, highestMember.tree, path),
      treeEntry(exec, top.tree, path),
    ]);
    if (highestEntry === null || topEntry === null) return null;
    if (!sameBytes(highestEntry, topEntry)) return false;
  }
  return true;
}

async function commitContentNeutralAbsorption(
  input: DeliveryChainAbsorptionInput,
): Promise<DeliveryChainAbsorptionResult> {
  try {
    const commit = text((await input.exec([
      "commit-tree", input.top.tree,
      "-p", input.top.head,
      "-p", input.highestMember.head,
      "-m", "Absorb contained delivery predecessor",
    ])).stdout);
    if (commit === null || !objectId.test(commit)) {
      return { status: "refused", reason: "absorption-unavailable" };
    }
    await input.exec([
      "update-ref", "-m", "delivery predecessor absorption",
      input.topRef, commit, input.top.head,
    ]);
    const absorbed = await observeExactAbsorption(
      input.exec, commit, input.top.head, input.highestMember.head,
    );
    return absorbed !== null && absorbed.tree === input.top.tree && await statusText(input.exec) === ""
      ? { status: "absorbed", ...absorbed }
      : { status: "refused", reason: "absorption-unavailable" };
  } catch {
    return { status: "refused", reason: "absorption-unavailable" };
  }
}

async function preparedTreeIsCheckedOut(exec: RawGitExec, tree: string): Promise<boolean> {
  try {
    const [indexTree, untracked] = await Promise.all([
      exec(["write-tree"], { objectAccess: "local-only" }).then(({ stdout }) => text(stdout)),
      exec(["ls-files", "--others", "--exclude-standard", "-z"], { objectAccess: "local-only" }),
    ]);
    if (indexTree !== tree || untracked.stdout.byteLength !== 0 || await mergeInProgress(exec)) return false;
    await exec(["diff", "--quiet"], { objectAccess: "local-only" });
    return true;
  } catch {
    return false;
  }
}

/** Exact checked-out terminal coordinate required before a refresh may reserve or publish. */
export interface DeliveryChainAbsorptionPreflightInput {
  readonly exec: RawGitExec;
  readonly topRef: string;
  readonly top: DeliveryContributionCoordinate;
}

/** Closed terminal-readiness result for pre-publication callers. */
export type DeliveryChainAbsorptionPreflightResult =
  | { readonly status: "ready" }
  | {
      readonly status: "refused";
      readonly reason:
        | "top-ref-invalid"
        | "top-not-checked-out"
        | "top-moved"
        | "coordinate-invalid"
        | "worktree-dirty"
        | "absorption-unavailable";
    };

/**
 * Check terminal absorption readiness without creating a reservation or mutating Git.
 *
 * @param input - Exact terminal branch and coordinate plus the Git boundary
 * @returns Ready only for the clean, checked-out, exact terminal head
 */
export async function preflightGitDeliveryChainAbsorption(
  input: DeliveryChainAbsorptionPreflightInput,
): Promise<DeliveryChainAbsorptionPreflightResult> {
  if (!validTopRef(input.topRef)) return { status: "refused", reason: "top-ref-invalid" };
  if (!await coordinateMatches(input.exec, input.top)) {
    return { status: "refused", reason: "coordinate-invalid" };
  }
  if (await checkedOutRef(input.exec) !== input.topRef) {
    return { status: "refused", reason: "top-not-checked-out" };
  }
  if (await observeCommit(input.exec, "HEAD") !== input.top.head) {
    return { status: "refused", reason: "top-moved" };
  }
  if (await mergeInProgress(input.exec)) {
    return { status: "refused", reason: "absorption-unavailable" };
  }
  const status = await statusText(input.exec);
  if (status === null) return { status: "refused", reason: "absorption-unavailable" };
  return status === ""
    ? { status: "ready" }
    : { status: "refused", reason: "worktree-dirty" };
}

/** Exact checked-out top and refreshed predecessor coordinates for one absorption attempt. */
export interface DeliveryChainAbsorptionInput {
  readonly exec: RawGitExec;
  readonly topRef: string;
  readonly top: DeliveryContributionCoordinate;
  readonly previousHighestMember: { readonly head: string; readonly tree?: string };
  readonly highestMember: DeliveryContributionCoordinate;
}

/** Closed absorption result with the append-only top coordinate on success. */
export type DeliveryChainAbsorptionResult =
  | { readonly status: "absorbed"; readonly head: string; readonly tree: string }
  | {
      readonly status: "refused";
      readonly reason:
        | "top-ref-invalid"
        | "top-not-checked-out"
        | "top-moved"
        | "coordinate-invalid"
        | "worktree-dirty"
        | "content-conflict"
        | "absorption-unavailable";
      readonly paths?: readonly string[];
    };

/**
 * Merge refreshed predecessor content into the checked-out top without rewriting history.
 *
 * @param input - Pinned top/ref coordinates, refreshed predecessor coordinates, and Git boundary
 * @returns The new append-only top coordinate or a typed refusal
 */
/** What each absorption refusal asks the operator to do, keyed by the condition the guard actually observed. */
export const DELIVERY_CHAIN_ABSORPTION_REMEDIES: Record<
  Extract<DeliveryChainAbsorptionResult, { status: "refused" }>["reason"],
  { readonly remedy: DeliveryTerminalRemedy; readonly recommendedActionText: string }
> = {
  "top-ref-invalid": {
    remedy: { kind: "delivery-record-repair-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and repair the landing record, whose terminal ref is not a usable ref name.",
  },
  "coordinate-invalid": {
    remedy: { kind: "delivery-host-reobservation-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and rerun `arc delivery native land-status` to re-observe the terminal "
      + "coordinates, which no longer match the repository.",
  },
  "top-not-checked-out": {
    remedy: { kind: "delivery-terminal-checkout-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and check out the terminal top branch before retrying native landing settlement.",
  },
  "top-moved": {
    remedy: { kind: "delivery-terminal-restore-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and restore the exact terminal top before retrying native landing settlement.",
  },
  "worktree-dirty": {
    remedy: { kind: "delivery-worktree-clean-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and commit or set aside the terminal checkout's worktree changes before "
      + "retrying native landing settlement.",
  },
  "content-conflict": {
    remedy: { kind: "delivery-terminal-hand-merge-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and merge the highest member into the checked-out terminal top by hand, then "
      + "rerun `arc delivery native land-status` to absorb the merged top.",
  },
  "absorption-unavailable": {
    remedy: { kind: "delivery-terminal-absorption-retry-required", automatedCommand: null },
    recommendedActionText:
      "Keep the reservation and conclude any in-progress merge in the terminal checkout, then rerun "
      + "`arc delivery native land-status`.",
  },
};

export async function absorbGitDeliveryChain(
  input: DeliveryChainAbsorptionInput,
): Promise<DeliveryChainAbsorptionResult> {
  if (!validTopRef(input.topRef)) {
    return { status: "refused", reason: "top-ref-invalid" };
  }
  if (!await coordinateMatches(input.exec, input.top)
    || !await logicalBaseMatches(input.exec, input.previousHighestMember)
    || !await coordinateMatches(input.exec, input.highestMember)) {
    return { status: "refused", reason: "coordinate-invalid" };
  }
  if (await checkedOutRef(input.exec) !== input.topRef) {
    return { status: "refused", reason: "top-not-checked-out" };
  }
  let current = await observeCommit(input.exec, "HEAD");
  if (current !== input.top.head) {
    const absorbed = current === null ? null : await observeExactAbsorption(
      input.exec, current, input.top.head, input.highestMember.head,
    );
    if (absorbed === null) return { status: "refused", reason: "top-moved" };
    const status = await statusText(input.exec);
    return status === ""
      ? { status: "absorbed", ...absorbed }
      : status === null
        ? { status: "refused", reason: "absorption-unavailable" }
        : { status: "refused", reason: "worktree-dirty" };
  }
  try {
    const mergeHead = await observeCommit(input.exec, "MERGE_HEAD");
    if (mergeHead !== null) {
      if (mergeHead !== input.highestMember.head) {
        return { status: "refused", reason: "absorption-unavailable" };
      }
      await input.exec(["merge", "--abort"]);
      current = await observeCommit(input.exec, "HEAD");
      if (current !== input.top.head || await mergeInProgress(input.exec)) {
        return { status: "refused", reason: "absorption-unavailable" };
      }
    }
    const initialStatus = await statusText(input.exec);
    if (initialStatus === null) return { status: "refused", reason: "absorption-unavailable" };
    if (initialStatus === "" && await highestMovementIsContained(
      input.exec, input.previousHighestMember, input.highestMember, input.top,
    ) === true) {
      return await commitContentNeutralAbsorption(input);
    }
    if (!await supportsMergeTreeWriteTree(input.exec, input.top.head)) {
      return { status: "refused", reason: "absorption-unavailable" };
    }
    const mergeArgs = [
      "merge-tree",
      "--write-tree",
      "--merge-base", input.previousHighestMember.head,
      "--name-only",
      "-z",
      "--no-messages",
      input.top.head,
      input.highestMember.head,
    ];
    let merged: ReturnType<typeof mergeTreeOutput>;
    try {
      merged = mergeTreeOutput((await input.exec(
        mergeArgs,
        { objectAccess: "local-only" },
      )).stdout);
    } catch (error) {
      const failure = normalizeGitRejection(error, { command: "git", args: mergeArgs });
      if (failure.kind === "nonzero-exit" && failure.exitCode === 1) {
        const conflicted = mergeTreeOutput(Buffer.from(failure.stdout, "latin1"));
        if (conflicted !== null && conflicted.paths.length > 0) {
          return { status: "refused", reason: "content-conflict", paths: conflicted.paths };
        }
      }
      return { status: "refused", reason: "absorption-unavailable" };
    }
    if (merged === null || merged.paths.length > 0) {
      return { status: "refused", reason: "absorption-unavailable" };
    }
    const status = await statusText(input.exec);
    if (status === null) return { status: "refused", reason: "absorption-unavailable" };
    const resumingPreparedTree = status !== ""
      && await preparedTreeIsCheckedOut(input.exec, merged.tree);
    if (status !== "" && !resumingPreparedTree) {
      return { status: "refused", reason: "worktree-dirty" };
    }
    const commit = text((await input.exec([
      "commit-tree", merged.tree,
      "-p", input.top.head,
      "-p", input.highestMember.head,
      "-m", "Absorb refreshed delivery predecessor",
    ])).stdout);
    if (commit === null || !objectId.test(commit)) {
      return { status: "refused", reason: "absorption-unavailable" };
    }
    if (!resumingPreparedTree) {
      await input.exec(["read-tree", "--reset", "-u", merged.tree]);
      if (!await preparedTreeIsCheckedOut(input.exec, merged.tree)) {
        return { status: "refused", reason: "absorption-unavailable" };
      }
    }
    await input.exec([
      "update-ref", "-m", "delivery predecessor absorption",
      input.topRef, commit, input.top.head,
    ]);
    const [head, tree, parentLine] = await Promise.all([
      observeCommit(input.exec, "HEAD"),
      input.exec(["rev-parse", "HEAD^{tree}"], { objectAccess: "local-only" })
        .then(({ stdout }) => text(stdout)),
      input.exec(["rev-list", "--parents", "-n", "1", "HEAD"], { objectAccess: "local-only" })
        .then(({ stdout }) => text(stdout)),
    ]);
    if (head === null || tree === null || parentLine === null || await statusText(input.exec) !== ""
      || parentLine !== `${head} ${input.top.head} ${input.highestMember.head}`) {
      return { status: "refused", reason: "absorption-unavailable" };
    }
    return { status: "absorbed", head, tree };
  } catch {
    if (await mergeInProgress(input.exec)) {
      const paths = await unmergedPaths(input.exec);
      try {
        await input.exec(["merge", "--abort"]);
      } catch {
        return { status: "refused", reason: "absorption-unavailable" };
      }
      const [restoredHead, clean, stillMerging] = await Promise.all([
        observeCommit(input.exec, "HEAD"),
        input.exec(["status", "--porcelain=v1"], { objectAccess: "local-only" })
          .then(({ stdout }) => text(stdout) === "", () => false),
        mergeInProgress(input.exec),
      ]);
      if (restoredHead !== input.top.head || !clean || stillMerging) {
        return { status: "refused", reason: "absorption-unavailable" };
      }
      if (paths !== null && paths.length > 0) {
        return { status: "refused", reason: "content-conflict", paths };
      }
    }
    return { status: "refused", reason: "absorption-unavailable" };
  }
}

/** Append-only content absorption for a refreshed delivery predecessor. */

import type { RawGitExec } from "../change-facts.js";
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

async function mergeInProgress(exec: RawGitExec): Promise<boolean> {
  return await observeCommit(exec, "MERGE_HEAD") !== null;
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

/** Exact checked-out top and refreshed predecessor coordinates for one absorption attempt. */
export interface DeliveryChainAbsorptionInput {
  readonly exec: RawGitExec;
  readonly topRef: string;
  readonly top: DeliveryContributionCoordinate;
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
export async function absorbGitDeliveryChain(
  input: DeliveryChainAbsorptionInput,
): Promise<DeliveryChainAbsorptionResult> {
  if (!input.topRef.startsWith("refs/heads/") || input.topRef.startsWith("refs/heads/delivery/")
    || /[\0\r\n]/u.test(input.topRef)) {
    return { status: "refused", reason: "top-ref-invalid" };
  }
  if (!await coordinateMatches(input.exec, input.top)
    || !await coordinateMatches(input.exec, input.highestMember)) {
    return { status: "refused", reason: "coordinate-invalid" };
  }
  let checkedOut: string | null;
  try {
    checkedOut = text((await input.exec(
      ["symbolic-ref", "-q", "HEAD"],
      { objectAccess: "local-only" },
    )).stdout);
  } catch {
    checkedOut = null;
  }
  if (checkedOut !== input.topRef) return { status: "refused", reason: "top-not-checked-out" };
  let current = await observeCommit(input.exec, "HEAD");
  if (current !== input.top.head) {
    const absorbed = current === null ? null : await observeExactAbsorption(
      input.exec, current, input.top.head, input.highestMember.head,
    );
    return absorbed === null
      ? { status: "refused", reason: "top-moved" }
      : { status: "absorbed", ...absorbed };
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
    if (text((await input.exec(
      ["status", "--porcelain=v1"],
      { objectAccess: "local-only" },
    )).stdout) !== "") {
      return { status: "refused", reason: "worktree-dirty" };
    }
    await input.exec(["merge", "--no-ff", "--no-edit", input.highestMember.head]);
    const [head, tree, parentLine] = await Promise.all([
      observeCommit(input.exec, "HEAD"),
      input.exec(["rev-parse", "HEAD^{tree}"], { objectAccess: "local-only" })
        .then(({ stdout }) => text(stdout)),
      input.exec(["rev-list", "--parents", "-n", "1", "HEAD"], { objectAccess: "local-only" })
        .then(({ stdout }) => text(stdout)),
    ]);
    if (head === null || tree === null || parentLine === null
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

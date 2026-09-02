/** Exact remote-ref leases for delivery materialization. */

import type { GitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { resolveWorktreePathsByBranchResult } from "../git/worktree-roster.js";
import { readAncestry } from "../work-unit/git-decomposition-object-readers.js";
import { DeliveryPlanIdSchema } from "./schema.js";

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const candidateRef = /^refs\/arc\/delivery-candidates\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const refreshCandidateRef = /^refs\/arc\/delivery-refresh-candidates\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type DeliveryMemberRefCheckoutObservation =
  | {
      readonly status: "observed";
      readonly checkouts: readonly { readonly ref: string; readonly path: string }[];
    }
  | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" };

/**
 * Observe registered worktrees holding any exact canonical delivery-member ref.
 *
 * @param exec - Injectable local Git executor.
 * @param refs - Canonical delivery-member refs whose occupancy matters.
 * @returns Exact registered checkout paths, or an explicit malformed/unavailable refusal.
 */
export async function observeDeliveryMemberRefCheckouts(
  exec: GitExec,
  refs: readonly string[],
): Promise<DeliveryMemberRefCheckoutObservation> {
  const branches: Array<{ readonly ref: string; readonly branch: string }> = [];
  for (const ref of [...new Set(refs)]) {
    if (!ref.startsWith("refs/heads/delivery/")) {
      return { status: "refused", reason: "malformed" };
    }
    branches.push({ ref, branch: ref.slice("refs/heads/".length) });
  }
  if (branches.length === 0) return { status: "observed", checkouts: [] };
  const worktrees = await resolveWorktreePathsByBranchResult(exec);
  if (!worktrees.ok) return { status: "refused", reason: "unavailable" };
  return {
    status: "observed",
    checkouts: branches.flatMap(({ ref, branch }) => {
      const path = worktrees.paths.get(branch);
      return path === undefined ? [] : [{ ref, path }];
    }),
  };
}

type DeliveryLocalRefObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" };

export async function observeDeliveryLocalRef(
  exec: GitExec,
  ref: string,
): Promise<DeliveryLocalRefObservation> {
  const args = ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`];
  try {
    const { stdout } = await exec("git", args);
    const lines = stdout.trim() === "" ? [] : stdout.trim().split("\n");
    const [head] = lines;
    return lines.length === 1 && head !== undefined && objectId.test(head)
      ? { status: "observed", head }
      : { status: "refused", reason: "malformed" };
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    return failure.exitCode === 1
      ? { status: "absent" }
      : { status: "refused", reason: "unavailable" };
  }
}

/** Advance one local delivery ref only from its exact prior head. */
export async function rewriteDeliveryLocalRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}): Promise<
  | { readonly status: "rewritten" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  return rewriteExactLocalRef(input, input.ref.startsWith("refs/heads/delivery/"));
}

/** Rebind one exact private authoring candidate from its currently observed head. */
export async function rebindDeliveryCandidateRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}): Promise<
  | { readonly status: "rewritten" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  return rewriteExactLocalRef(input, candidateRef.test(input.ref));
}

async function rewriteExactLocalRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}, validRef: boolean): Promise<
  | { readonly status: "rewritten" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.beforeHead) || !objectId.test(input.requestedHead) || !validRef) {
    return { status: "refused", reason: "malformed" };
  }
  const before = await observeDeliveryLocalRef(input.exec, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "absent") return { status: "refused", reason: "collision" };
  if (before.head === input.requestedHead) return { status: "adopted" };
  if (before.head !== input.beforeHead) return { status: "refused", reason: "collision" };
  try {
    await input.exec("git", ["update-ref", input.ref, input.requestedHead, input.beforeHead]);
  } catch {
    const afterFailure = await observeDeliveryLocalRef(input.exec, input.ref);
    if (afterFailure.status === "observed" && afterFailure.head === input.requestedHead) {
      return { status: "adopted" };
    }
    return {
      status: "refused",
      reason: afterFailure.status === "refused" ? afterFailure.reason : "collision",
    };
  }
  const after = await observeDeliveryLocalRef(input.exec, input.ref);
  return after.status === "observed" && after.head === input.requestedHead
    ? { status: "rewritten" }
    : {
        status: "refused",
        reason: after.status === "refused" ? after.reason : "collision",
      };
}

/** Delete one local delivery ref only at its exact observed head. */
export async function deleteDeliveryLocalRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly expectedHead: string;
}): Promise<
  | { readonly status: "deleted" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  return deleteExactLocalRef(input, input.ref.startsWith("refs/heads/delivery/"));
}

/** Delete one exact private authoring candidate, never an ordinary branch or foreign private ref. */
export async function deleteDeliveryCandidateRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly expectedHead: string;
}): Promise<
  | { readonly status: "deleted" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  return deleteExactLocalRef(input, candidateRef.test(input.ref));
}

export type DeliveryRefreshCandidateRefObservation =
  | {
      readonly status: "observed";
      readonly candidates: readonly { readonly ref: string; readonly head: string }[];
    }
  | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" };

/** Enumerate every exact ARC-owned refresh candidate under one validated delivery-plan namespace. */
export async function observeDeliveryRefreshCandidateRefs(
  exec: GitExec,
  planId: string,
): Promise<DeliveryRefreshCandidateRefObservation> {
  if (!DeliveryPlanIdSchema.safeParse(planId).success) {
    return { status: "refused", reason: "malformed" };
  }
  const prefix = `refs/arc/delivery-refresh-candidates/${planId}/`;
  try {
    const { stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      prefix,
    ]);
    const candidates: Array<{ ref: string; head: string }> = [];
    for (const line of stdout.split("\n")) {
      if (line === "") continue;
      const [ref, head, ...tail] = line.split(" ");
      if (ref === undefined || head === undefined || tail.length !== 0
        || !ref.startsWith(prefix) || !refreshCandidateRef.test(ref) || !objectId.test(head)) {
        return { status: "refused", reason: "malformed" };
      }
      candidates.push({ ref, head });
    }
    return { status: "observed", candidates };
  } catch {
    return { status: "refused", reason: "unavailable" };
  }
}

/** Delete one exact refresh candidate without authority over any other local ref. */
export async function deleteDeliveryRefreshCandidateRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly expectedHead: string;
}): Promise<
  | { readonly status: "deleted" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  return deleteExactLocalRef(input, refreshCandidateRef.test(input.ref));
}

async function deleteExactLocalRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly expectedHead: string;
}, allowedRef: boolean): Promise<
  | { readonly status: "deleted" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.expectedHead) || !allowedRef) return { status: "refused", reason: "malformed" };
  const before = await observeDeliveryLocalRef(input.exec, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "absent") return { status: "adopted" };
  if (before.head !== input.expectedHead) return { status: "refused", reason: "collision" };
  try {
    await input.exec("git", ["update-ref", "-d", input.ref, input.expectedHead]);
  } catch {
    const afterFailure = await observeDeliveryLocalRef(input.exec, input.ref);
    if (afterFailure.status === "absent") return { status: "adopted" };
    return {
      status: "refused",
      reason: afterFailure.status === "refused" ? afterFailure.reason : "collision",
    };
  }
  const after = await observeDeliveryLocalRef(input.exec, input.ref);
  return after.status === "absent"
    ? { status: "deleted" }
    : {
        status: "refused",
        reason: after.status === "refused" ? after.reason : "collision",
      };
}

async function publishDeliveryLocalRef(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly head: string;
}): Promise<
  | { readonly status: "published" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.head) || !input.ref.startsWith("refs/heads/delivery/")) {
    return { status: "refused", reason: "malformed" };
  }
  const before = await observeDeliveryLocalRef(input.exec, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "observed") {
    return before.head === input.head
      ? { status: "adopted" }
      : { status: "refused", reason: "collision" };
  }
  try {
    await input.exec("git", ["update-ref", input.ref, input.head, ""]);
  } catch {
    const afterFailure = await observeDeliveryLocalRef(input.exec, input.ref);
    if (afterFailure.status === "observed") {
      return afterFailure.head === input.head
        ? { status: "adopted" }
        : { status: "refused", reason: "collision" };
    }
    return { status: "refused", reason: "unavailable" };
  }
  const after = await observeDeliveryLocalRef(input.exec, input.ref);
  return after.status === "observed" && after.head === input.head
    ? { status: "published" }
    : { status: "refused", reason: after.status === "refused" ? after.reason : "unavailable" };
}

/** Closed exact remote observation. */
export type DeliveryRemoteRefObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" };

/** Observe one full remote ref without updating local tracking state. */
export async function observeDeliveryRemoteRef(
  exec: GitExec,
  remote: string,
  ref: string,
): Promise<DeliveryRemoteRefObservation> {
  try {
    const { stdout } = await exec("git", ["ls-remote", "--refs", remote, ref]);
    const lines = stdout.trim() === "" ? [] : stdout.trim().split("\n");
    if (lines.length === 0) return { status: "absent" };
    if (lines.length !== 1) return { status: "refused", reason: "malformed" };
    const [line] = lines;
    if (line === undefined) return { status: "refused", reason: "malformed" };
    const [head, observedRef, ...tail] = line.split("\t");
    return head !== undefined && objectId.test(head) && observedRef === ref && tail.length === 0
      ? { status: "observed", head }
      : { status: "refused", reason: "malformed" };
  } catch {
    return { status: "refused", reason: "unavailable" };
  }
}

/** Create one absent remote ref by lease, or adopt an exact already-applied head. */
export async function publishDeliveryRemoteRef(input: {
  readonly exec: GitExec;
  readonly remote: string;
  readonly ref: string;
  readonly head: string;
}): Promise<
  | { readonly status: "published" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "stale-lease" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.head) || !input.ref.startsWith("refs/heads/")) {
    return { status: "refused", reason: "malformed" };
  }
  const before = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "observed") {
    return before.head === input.head
      ? { status: "adopted" }
      : { status: "refused", reason: "collision" };
  }
  try {
    await input.exec("git", [
      "push", input.remote, `${input.head}:${input.ref}`, `--force-with-lease=${input.ref}:`,
    ]);
  } catch {
    const afterFailure = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
    if (afterFailure.status === "observed") {
      return afterFailure.head === input.head
        ? { status: "adopted" }
        : { status: "refused", reason: "stale-lease" };
    }
    return { status: "refused", reason: "unavailable" };
  }
  const after = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  if (after.status === "observed") {
    return after.head === input.head
      ? { status: "published" }
      : { status: "refused", reason: "stale-lease" };
  }
  return { status: "refused", reason: "unavailable" };
}

/** Create or adopt one exact local delivery branch before publishing the matching remote ref. */
export async function publishDeliveryMemberRef(input: {
  readonly exec: GitExec;
  readonly remote: string;
  readonly ref: string;
  readonly head: string;
}): Promise<
  | { readonly status: "published" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "stale-lease" | "malformed" | "unavailable" }
> {
  const local = await publishDeliveryLocalRef(input);
  if (local.status === "refused") return local;
  return publishDeliveryRemoteRef(input);
}

/** Advance the ordinary work-unit branch without rewrite semantics. */
export async function publishDeliveryTopRef(input: {
  readonly exec: GitExec;
  readonly remote: string;
  readonly ref: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}): Promise<
  | { readonly status: "published" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.beforeHead) || !objectId.test(input.requestedHead)
    || !input.ref.startsWith("refs/heads/") || input.ref.startsWith("refs/heads/delivery/")) {
    return { status: "refused", reason: "malformed" };
  }
  const before = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "observed" && before.head === input.requestedHead) return { status: "adopted" };
  if (before.status === "observed" && before.head !== input.beforeHead
    && await readAncestry(input.exec, before.head, input.beforeHead) !== "ancestor") {
    return { status: "refused", reason: "collision" };
  }
  try {
    await input.exec("git", ["push", input.remote, `${input.requestedHead}:${input.ref}`]);
  } catch {
    const afterFailure = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
    if (afterFailure.status === "observed" && afterFailure.head === input.requestedHead) {
      return { status: "adopted" };
    }
    return {
      status: "refused",
      reason: afterFailure.status === "observed" ? "collision" : "unavailable",
    };
  }
  const after = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  if (after.status === "observed") {
    return after.head === input.requestedHead
      ? { status: "published" }
      : { status: "refused", reason: "collision" };
  }
  return { status: "refused", reason: "unavailable" };
}

/** Rewrite one remote ref only from its exact stored head, or adopt the exact already-applied result. */
export async function rewriteDeliveryRemoteRef(input: {
  readonly exec: GitExec;
  readonly remote: string;
  readonly ref: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}): Promise<
  | { readonly status: "rewritten" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "stale-lease" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.beforeHead) || !objectId.test(input.requestedHead)
    || !input.ref.startsWith("refs/heads/")) return { status: "refused", reason: "malformed" };
  const before = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "absent") return { status: "refused", reason: "collision" };
  if (before.head === input.requestedHead) return { status: "adopted" };
  if (before.head !== input.beforeHead) return { status: "refused", reason: "collision" };
  try {
    await input.exec("git", [
      "push", input.remote, `${input.requestedHead}:${input.ref}`,
      `--force-with-lease=${input.ref}:${input.beforeHead}`,
    ]);
  } catch {
    const afterFailure = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
    if (afterFailure.status === "observed" && afterFailure.head === input.requestedHead) {
      return { status: "adopted" };
    }
    return { status: "refused", reason: afterFailure.status === "refused" ? "unavailable" : "stale-lease" };
  }
  const after = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  return after.status === "observed" && after.head === input.requestedHead
    ? { status: "rewritten" }
    : { status: "refused", reason: after.status === "refused" ? "unavailable" : "stale-lease" };
}

/** Advance matching remote and local delivery refs under one retained operation. */
export async function rewriteDeliveryMemberRef(input: {
  readonly exec: GitExec;
  readonly remote: string;
  readonly ref: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}): Promise<
  | { readonly status: "rewritten" | "adopted" }
  | {
      readonly status: "refused";
      readonly reason: "collision" | "stale-lease" | "malformed" | "unavailable";
    }
> {
  if (!objectId.test(input.beforeHead) || !objectId.test(input.requestedHead)
    || !input.ref.startsWith("refs/heads/delivery/")) {
    return { status: "refused", reason: "malformed" };
  }
  const localBefore = await observeDeliveryLocalRef(input.exec, input.ref);
  if (localBefore.status === "refused") return localBefore;
  if (localBefore.status === "absent"
    || (localBefore.head !== input.beforeHead && localBefore.head !== input.requestedHead)) {
    return { status: "refused", reason: "collision" };
  }
  const remote = await rewriteDeliveryRemoteRef(input);
  if (remote.status === "refused") return remote;
  const local = await rewriteDeliveryLocalRef(input);
  if (local.status === "refused") return local;
  return remote.status === "rewritten" || local.status === "rewritten"
    ? { status: "rewritten" }
    : { status: "adopted" };
}

/** Delete one remote ref only at its exact observed head, or adopt exact absence. */
export async function deleteDeliveryRemoteRef(input: {
  readonly exec: GitExec;
  readonly remote: string;
  readonly ref: string;
  readonly expectedHead: string;
}): Promise<
  | { readonly status: "deleted" | "adopted" }
  | { readonly status: "refused"; readonly reason: "collision" | "stale-lease" | "malformed" | "unavailable" }
> {
  if (!objectId.test(input.expectedHead) || !input.ref.startsWith("refs/heads/")) {
    return { status: "refused", reason: "malformed" };
  }
  const before = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  if (before.status === "refused") return before;
  if (before.status === "absent") return { status: "adopted" };
  if (before.head !== input.expectedHead) return { status: "refused", reason: "collision" };
  try {
    await input.exec("git", [
      "push", input.remote, `--force-with-lease=${input.ref}:${input.expectedHead}`, `:${input.ref}`,
    ]);
  } catch {
    const afterFailure = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
    if (afterFailure.status === "absent") return { status: "adopted" };
    return { status: "refused", reason: afterFailure.status === "refused" ? "unavailable" : "stale-lease" };
  }
  const after = await observeDeliveryRemoteRef(input.exec, input.remote, input.ref);
  return after.status === "absent"
    ? { status: "deleted" }
    : { status: "refused", reason: after.status === "refused" ? "unavailable" : "stale-lease" };
}

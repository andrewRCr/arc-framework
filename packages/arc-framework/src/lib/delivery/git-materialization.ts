/** Exact remote-ref leases for delivery materialization. */

import type { GitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const absentObjectId = "0".repeat(40);

type DeliveryLocalRefObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" };

async function observeDeliveryLocalRef(exec: GitExec, ref: string): Promise<DeliveryLocalRefObservation> {
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
    await input.exec("git", ["update-ref", input.ref, input.head, absentObjectId]);
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

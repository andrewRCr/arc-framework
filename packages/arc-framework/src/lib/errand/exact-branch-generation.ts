/**
 * Exact local-and-remote branch generation reads and teardown.
 *
 * A transient tail settles in two durable steps: it deletes the branch refs of
 * one proven head, then retires the identity that named them. Nothing can make
 * those one transaction, so a failure between them leaves refs already gone and
 * a claim still standing — a state the next pass has to settle rather than
 * refuse. Each side is therefore classified before it is touched: present at the
 * proven head (delete it), proven absent (an earlier pass deleted it), or moved
 * (refuse — the head being settled is no longer the head the ref carries).
 *
 * Absence is a proof obligation, not a fallback: an unreachable remote is an
 * error rather than an absent ref, so a network failure can never be read as a
 * completed deletion.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import { gitFailureText, normalizeGitRejection } from "../git/process-error.js";
import { uniqueRefToken } from "../git/ref-tree.js";
import { deleteRemoteBranch } from "../work-unit/mutators/reconcile-branch.js";

/** The remote every transient tail publishes its branch to. */
const REMOTE = "origin";

/** A ref read that resolved, proved absent, or could not be performed. */
export type OptionalCommit =
  | { kind: "absent" }
  | { kind: "present"; oid: string }
  | { kind: "error"; message: string };

/** Operands shared by the exact-generation read and teardown. */
export interface ExactBranchGenerationOptions {
  /** Branch whose local and remote refs form the generation. */
  readonly branch: string;
  /** Subject noun used in refusal text — `Local ${subject} head moved.` */
  readonly subject: string;
  /** Ref namespace the remote read fetches into; a unique token is appended. */
  readonly temporaryRefNamespace: string;
}

/** Operands for {@link tearDownExactBranchGeneration}. */
export interface ExactBranchTeardownOptions extends ExactBranchGenerationOptions {
  /** The head both refs must carry for their deletion to be authorized. */
  readonly expectedHead: string;
  /** Revalidate caller authority after remote reads and immediately before each deletion. */
  readonly authorizeDelete?: () => Promise<ExactBranchTeardownAuthorization>;
}

/** Caller-owned authority checked inside the ref teardown boundary. */
export type ExactBranchTeardownAuthorization =
  | { kind: "authorized" }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

/** The exact head a branch carries on both sides, or why it cannot be read. */
export type ExactBranchGeneration =
  | { kind: "exact"; head: string }
  | { kind: "absent" }
  | { kind: "unproven"; message: string };

/** Outcome of one exact branch-generation teardown pass. */
export type ExactBranchTeardownResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "authorization-refused"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

/**
 * Read the one head a branch carries locally and on its remote.
 *
 * Used where the settled head is not already recorded — an open tail proves its
 * own head from the refs. Both sides absent is the generation an earlier pass
 * already deleted, which callers settle without a head to prove.
 *
 * The two sides are read asymmetrically because the teardown deletes them in a
 * fixed order: a local head over a proven-absent remote is the state that
 * teardown leaves behind when it is interrupted between the two deletions, so it
 * still names this generation's head. The mirror is unreachable that way and
 * stays unproven, as does any reading that rests on an unread remote.
 *
 * @param exec - Injected git executor.
 * @param options - Branch, subject noun, and temporary ref namespace.
 * @returns The exact head, proven absence, or why neither could be established.
 */
export async function readExactBranchGeneration(
  exec: GitExec,
  options: ExactBranchGenerationOptions,
): Promise<ExactBranchGeneration> {
  const sides = await readBothSides(exec, options);
  if (sides.kind === "error") return { kind: "unproven", message: sides.message };
  const { local, remote } = sides;
  if (local.kind === "absent") {
    return remote.kind === "absent"
      ? { kind: "absent" }
      : { kind: "unproven", message: `Local ${options.subject} branch is absent while its remote head stands.` };
  }
  if (remote.kind === "absent") return { kind: "exact", head: local.oid };
  return local.oid === remote.oid
    ? { kind: "exact", head: local.oid }
    : { kind: "unproven", message: `Local and remote ${options.subject} heads differ.` };
}

/**
 * Delete the local and remote refs of one proven branch generation.
 *
 * Each side is deleted only while it still carries `expectedHead`, and a side
 * proven absent is accepted as already deleted so a pass interrupted between the
 * two deletions — or between them and the identity retirement that follows —
 * settles on replay instead of refusing forever.
 *
 * @param exec - Injected git executor.
 * @param options - Branch, proven head, subject noun, and temporary ref namespace.
 * @returns Whether refs were deleted, were already gone, or could not be proven.
 */
export async function tearDownExactBranchGeneration(
  exec: GitExec,
  options: ExactBranchTeardownOptions,
): Promise<ExactBranchTeardownResult> {
  const sides = await readBothSides(exec, options);
  if (sides.kind === "error") return sides;
  const { local, remote } = sides;
  if (remote.kind === "present" && remote.oid !== options.expectedHead) {
    return { kind: "refused", message: `Remote ${options.subject} head moved.` };
  }
  if (local.kind === "present" && local.oid !== options.expectedHead) {
    return { kind: "refused", message: `Local ${options.subject} head moved.` };
  }

  let changed = false;
  if (remote.kind === "present") {
    const authorization = await authorizeDeletion(options);
    if (authorization.kind !== "authorized") return authorization;
    try {
      const deleted = await deleteRemoteBranch(exec, REMOTE, options.branch, options.expectedHead);
      if (deleted === "stale") return { kind: "refused", message: `Remote ${options.subject} head moved.` };
      changed ||= deleted === "deleted";
    } catch (error) {
      return gitReadError(error, ["push", REMOTE, "--delete", options.branch]);
    }
  }
  if (local.kind === "present") {
    const authorization = await authorizeDeletion(options);
    if (authorization.kind !== "authorized") return authorization;
    const args = ["update-ref", "-d", `refs/heads/${options.branch}`, options.expectedHead];
    try {
      await exec("git", args);
      changed = true;
    } catch (error) {
      return gitReadError(error, args);
    }
  }
  return { kind: changed ? "applied" : "idempotent" };
}

async function authorizeDeletion(
  options: ExactBranchTeardownOptions,
): Promise<Extract<ExactBranchTeardownResult, { kind: "authorization-refused" | "error" }> | { kind: "authorized" }> {
  if (options.authorizeDelete === undefined) return { kind: "authorized" };
  try {
    const result = await options.authorizeDelete();
    return result.kind === "refused" ? { kind: "authorization-refused", message: result.message } : result;
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Resolve a ref to its commit, distinguishing an absent ref from a failed read.
 *
 * @param exec - Injected git executor.
 * @param ref - Fully qualified ref to resolve.
 * @returns The commit the ref carries, proven absence, or the failure.
 */
export async function resolveOptionalCommit(exec: GitExec, ref: string): Promise<OptionalCommit> {
  const args = ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`];
  try {
    const oid = (await exec("git", args)).stdout.trim();
    return /^[0-9a-f]{40}$/u.test(oid) ? { kind: "present", oid } : { kind: "error", message: "Ref resolved to an invalid OID." };
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    return normalized.exitCode === 1
      ? { kind: "absent" }
      : { kind: "error", message: normalized.message };
  }
}

/** Both sides of one branch, or the first failure that stopped the read. */
type BothSides =
  | { kind: "read"; local: Exclude<OptionalCommit, { kind: "error" }>; remote: Exclude<OptionalCommit, { kind: "error" }> }
  | { kind: "error"; message: string };

async function readBothSides(exec: GitExec, options: ExactBranchGenerationOptions): Promise<BothSides> {
  const ref = `refs/heads/${options.branch}`;
  const temporaryRef = `${options.temporaryRefNamespace}/${uniqueRefToken()}`;
  const remote = await fetchExactRemoteHead(exec, ref, temporaryRef);
  try {
    await exec("git", ["update-ref", "-d", temporaryRef]);
  } catch (error) {
    if (remote.kind !== "error") return gitReadError(error, ["update-ref", "-d", temporaryRef]);
  }
  if (remote.kind === "error") return remote;
  const local = await resolveOptionalCommit(exec, ref);
  return local.kind === "error" ? local : { kind: "read", local, remote };
}

async function fetchExactRemoteHead(exec: GitExec, remoteRef: string, temporaryRef: string): Promise<OptionalCommit> {
  const args = ["fetch", "--", REMOTE, `+${remoteRef}:${temporaryRef}`];
  try {
    await exec("git", args);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    return normalized.expectedOutcome === "absent-remote-ref"
      || /(?:could(?:n't| not)|cannot) find remote ref/iu.test(gitFailureText(error))
      ? { kind: "absent" }
      : { kind: "error", message: normalized.message };
  }
  return resolveOptionalCommit(exec, temporaryRef);
}

function gitReadError(error: unknown, args: string[]): { kind: "error"; message: string } {
  return { kind: "error", message: normalizeGitRejection(error, { command: "git", args }).message };
}

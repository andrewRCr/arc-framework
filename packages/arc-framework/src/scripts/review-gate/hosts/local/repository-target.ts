/** Canonical local Git target derivation for review preparation. */

import type { GitExec } from "../../../../lib/git/exec.js";
import type { DeliveryMemberBinding } from "../../core/delivery-member-lookup.js";
import { createReviewTarget } from "../../core/gate-contract-v2.js";
import {
  ReviewTargetSchema,
  type ReviewTarget,
} from "../../core/gate-contract-v2-schema.js";

export type LocalTargetInvalidReason =
  | "dirty-worktree"
  | "invalid-base"
  | "no-merge-base"
  | "non-commit-head"
  | "unborn-repository"
  | "unresolved-base";

/** Stable invalid-input failure emitted while deriving trusted local Git facts. */
export class LocalTargetDerivationError extends Error {
  readonly code = "invalid-input" as const;

  constructor(public readonly reason: LocalTargetInvalidReason) {
    super(reason);
    this.name = "LocalTargetDerivationError";
  }
}

/** The two commits delivery recorded for one member: its own head and its predecessor's. */
export interface DeliveryMemberCoordinates {
  headSha: string;
  diffBaseSha: string;
}

export interface LocalTargetDerivationInput {
  exec: GitExec;
  cwd: string;
  baseRef: string;
  repositoryId: string;
  /** Supplied together or not at all; their presence selects the `delivery-member` kind. */
  memberCoordinates?: DeliveryMemberCoordinates;
}

interface DerivedCoordinates {
  diffBaseSha: string;
  diffBaseTree: string;
  headSha: string;
  headTree: string;
}

export type LocalTargetConfirmation =
  | { state: "current"; target: ReviewTarget }
  | {
      state: "stale-target";
      attemptedTarget: ReviewTarget;
      currentTarget: ReviewTarget;
    };

interface GitBoundary {
  exec: GitExec;
  cwd: string;
}

async function readGit(
  input: GitBoundary,
  args: string[],
  reason: LocalTargetInvalidReason,
): Promise<string> {
  try {
    return (await input.exec("git", args, { cwd: input.cwd })).stdout.trim();
  } catch {
    throw new LocalTargetDerivationError(reason);
  }
}

async function resolveObject(
  input: GitBoundary,
  revision: string,
  reason: LocalTargetInvalidReason,
): Promise<{ oid: string; type: string }> {
  const oid = await readGit(input, ["rev-parse", "--verify", revision], reason);
  const type = await readGit(input, ["cat-file", "-t", oid], reason);
  return { oid, type };
}

/** Derive the change set from the checkout: its HEAD, its working tree, and the base's merge base. */
async function deriveFromCheckout(
  input: LocalTargetDerivationInput,
  baseRef: string,
): Promise<DerivedCoordinates> {
  const head = await resolveObject(input, "HEAD", "unborn-repository");
  if (head.type !== "commit") throw new LocalTargetDerivationError("non-commit-head");

  const base = await resolveObject(input, `refs/heads/${baseRef}`, "unresolved-base");
  if (base.type !== "commit") throw new LocalTargetDerivationError("unresolved-base");

  const status = await readGit(
    input,
    ["status", "--porcelain=v2", "--untracked-files=normal"],
    "dirty-worktree",
  );
  if (status !== "") throw new LocalTargetDerivationError("dirty-worktree");

  const diffBaseSha = await readGit(input, ["merge-base", base.oid, head.oid], "no-merge-base");
  const [diffBaseTree, headTree] = await Promise.all([
    readGit(input, ["rev-parse", `${diffBaseSha}^{tree}`], "no-merge-base"),
    readGit(input, ["rev-parse", `${head.oid}^{tree}`], "non-commit-head"),
  ]);
  return { diffBaseSha, diffBaseTree, headSha: head.oid, headTree };
}

/** Verify that both recorded commits are present and are commits, reusing the derivation reasons. */
async function verifyMemberCommits(
  input: GitBoundary,
  coordinates: DeliveryMemberCoordinates,
): Promise<{ head: string; base: string }> {
  const head = await resolveObject(input, coordinates.headSha, "non-commit-head");
  if (head.type !== "commit") throw new LocalTargetDerivationError("non-commit-head");

  const base = await resolveObject(input, coordinates.diffBaseSha, "unresolved-base");
  if (base.type !== "commit") throw new LocalTargetDerivationError("unresolved-base");

  return { head: head.oid, base: base.oid };
}

/** Resolve the two supplied commits and their trees, reading neither HEAD nor the working tree. */
async function resolveMemberCoordinates(
  input: LocalTargetDerivationInput,
  coordinates: DeliveryMemberCoordinates,
): Promise<DerivedCoordinates> {
  const { head, base } = await verifyMemberCommits(input, coordinates);

  const [diffBaseTree, headTree] = await Promise.all([
    readGit(input, ["rev-parse", `${base}^{tree}`], "unresolved-base"),
    readGit(input, ["rev-parse", `${head}^{tree}`], "non-commit-head"),
  ]);
  return { diffBaseSha: base, diffBaseTree, headSha: head, headTree };
}

/**
 * Derives an exact review target from clean repository state, or from supplied member coordinates.
 *
 * Without `memberCoordinates` the target is the checkout's own change set against the base ref's
 * merge base, and a dirty working tree refuses. With them the two recorded commits are the target
 * verbatim: no merge base is computed, the base ref's object is never resolved, and neither HEAD
 * nor the working tree is read — a member is reviewed while its successor is authored on the same
 * checkout. The base ref is written into the target unchanged either way.
 *
 * @param input - Repository-local Git boundary, trusted repository/base facts, and optional
 *   recorded member coordinates.
 * @returns The canonical target and its domain-separated identity.
 */
export async function deriveLocalReviewTarget(
  input: LocalTargetDerivationInput,
): Promise<ReviewTarget> {
  const baseRef = input.baseRef.trim();
  if (baseRef === "") throw new LocalTargetDerivationError("invalid-base");
  await readGit(input, ["check-ref-format", `refs/heads/${baseRef}`], "invalid-base");

  const coordinates = input.memberCoordinates;
  const derived = coordinates === undefined
    ? await deriveFromCheckout(input, baseRef)
    : await resolveMemberCoordinates(input, coordinates);

  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: coordinates === undefined ? "change-set" : "delivery-member",
    repositoryId: input.repositoryId,
    baseRef,
    ...derived,
  });
}

/**
 * Composes the review target for one resolved delivery member.
 *
 * The member's recorded base is its predecessor's head, which is the diff base for this review —
 * not the merge base of the head and `baseRef`. `baseRef` carries the base the stack lands to;
 * exactness rides the two commits. No member ref reaches derivation, so the plan's ref naming and
 * namespace stay outside this lane entirely.
 *
 * @param input - Repository-local Git boundary, the configured base ref, the composition root's
 *   repository identity, and the resolved member whose coordinates the target pins.
 * @returns The canonical member target and its domain-separated identity.
 */
export async function composeDeliveryMemberTarget(input: {
  exec: GitExec;
  cwd: string;
  baseRef: string;
  repositoryId: string;
  member: Pick<DeliveryMemberBinding, "base" | "head">;
}): Promise<ReviewTarget> {
  return deriveLocalReviewTarget({
    exec: input.exec,
    cwd: input.cwd,
    baseRef: input.baseRef,
    repositoryId: input.repositoryId,
    memberCoordinates: { headSha: input.member.head, diffBaseSha: input.member.base },
  });
}

/**
 * Re-derives local coordinates immediately before publication.
 *
 * A `delivery-member` target is verified rather than re-derived: its pinned commits must still
 * resolve, and nothing about the checkout is read. Re-deriving one would produce the control
 * branch's own change set and report every member operation stale. The recorded trees are not
 * re-checked against those commits — they were resolved from exactly these commits when the target
 * was composed, and the operation record is local state this lane already trusts.
 *
 * Staleness therefore keeps one meaning. The member path manufactures none: a stale result requires
 * a re-derived current target, which verification never produces. Drift in what the head is bound
 * to is caught at admission and at merge-lock release, not here.
 *
 * @param input - The attempted target plus the same Git boundary used to derive it.
 * @returns The unchanged target or an attempted/current stale pair.
 */
export async function confirmLocalReviewTarget(input: {
  exec: GitExec;
  cwd: string;
  attemptedTarget: ReviewTarget;
}): Promise<LocalTargetConfirmation> {
  const attemptedTarget = ReviewTargetSchema.parse(input.attemptedTarget);
  if (attemptedTarget.kind === "delivery-member") {
    await verifyMemberCommits(input, {
      headSha: attemptedTarget.headSha,
      diffBaseSha: attemptedTarget.diffBaseSha,
    });
    return { state: "current", target: attemptedTarget };
  }
  const currentTarget = await deriveLocalReviewTarget({
    exec: input.exec,
    cwd: input.cwd,
    baseRef: attemptedTarget.baseRef,
    repositoryId: attemptedTarget.repositoryId,
  });
  return currentTarget.targetId === attemptedTarget.targetId
    ? { state: "current", target: attemptedTarget }
    : { state: "stale-target", attemptedTarget, currentTarget };
}

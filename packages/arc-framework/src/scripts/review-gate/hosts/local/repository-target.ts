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

async function readGit(
  input: LocalTargetDerivationInput,
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
  input: LocalTargetDerivationInput,
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

/** Resolve the two supplied commits and their trees, reading neither HEAD nor the working tree. */
async function resolveMemberCoordinates(
  input: LocalTargetDerivationInput,
  coordinates: DeliveryMemberCoordinates,
): Promise<DerivedCoordinates> {
  const head = await resolveObject(input, coordinates.headSha, "non-commit-head");
  if (head.type !== "commit") throw new LocalTargetDerivationError("non-commit-head");

  const base = await resolveObject(input, coordinates.diffBaseSha, "unresolved-base");
  if (base.type !== "commit") throw new LocalTargetDerivationError("unresolved-base");

  const [diffBaseTree, headTree] = await Promise.all([
    readGit(input, ["rev-parse", `${base.oid}^{tree}`], "unresolved-base"),
    readGit(input, ["rev-parse", `${head.oid}^{tree}`], "non-commit-head"),
  ]);
  return { diffBaseSha: base.oid, diffBaseTree, headSha: head.oid, headTree };
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
  member: DeliveryMemberBinding;
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
 * @param input - The attempted target plus the same Git boundary used to derive it.
 * @returns The unchanged target or an attempted/current stale pair.
 */
export async function confirmLocalReviewTarget(input: {
  exec: GitExec;
  cwd: string;
  attemptedTarget: ReviewTarget;
}): Promise<LocalTargetConfirmation> {
  const attemptedTarget = ReviewTargetSchema.parse(input.attemptedTarget);
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

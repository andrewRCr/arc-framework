/** Canonical local Git target derivation for review preparation. */

import { resolveSoleMergeBase } from "../../../../lib/git/base-overlap.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import type { DeliveryMemberBinding } from "../../core/delivery-member-lookup.js";
import { createReviewTarget } from "../../core/gate-contract-v2.js";
import {
  ReviewTargetSchema,
  type ReviewTarget,
} from "../../core/gate-contract-v2-schema.js";
import {
  ReviewTargetCoordinatesSchema,
  type ReviewTargetCoordinates,
} from "../../core/review-target-coordinates.js";

export type LocalTargetInvalidReason =
  | "ambiguous-merge-base"
  | "dirty-worktree"
  | "invalid-base"
  | "no-merge-base"
  | "non-commit-head"
  | "unborn-repository"
  | "unresolved-base";

/** Stable invalid-input failure emitted while deriving trusted local Git facts. */
export class LocalTargetDerivationError extends Error {
  readonly code = "invalid-input" as const;

  /**
   * @param reason - The stable precondition the boundary reports and routes on.
   * @param detail - Where the precondition was observed, when the reason alone does not locate it.
   */
  constructor(public readonly reason: LocalTargetInvalidReason, detail: string = reason) {
    super(detail);
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

export type LocalCorrectionTargetConfirmation =
  | { state: "current"; target: ReviewTarget; dirtyPaths: readonly string[] }
  | { state: "stale-head"; attemptedTarget: ReviewTarget; currentHeadSha: string }
  | { state: "unexpected-dirty-paths"; target: ReviewTarget; unexpectedPaths: readonly string[] };

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

  // Read every best common ancestor rather than the one Git would otherwise return. What this resolves to
  // becomes the diff base the local host reviews from, so over a history leaving two, the change set examined
  // would be decided by a choice between them that nothing records and nobody made.
  const sole = await resolveSoleMergeBase({
    exec: (command, args) => input.exec(command, args, { cwd: input.cwd }),
    leftRevision: base.oid,
    rightRevision: head.oid,
  });
  // Two best bases and none at all are separate readings here, and stay separate: one is cleared by merging
  // the base in, and the other is not reachable from any state this branch can be put into.
  if (sole.status === "ambiguous") throw new LocalTargetDerivationError("ambiguous-merge-base");
  if (sole.status !== "resolved") throw new LocalTargetDerivationError("no-merge-base");
  const diffBaseSha = sole.mergeBase;
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
  input: GitBoundary,
  coordinates: DeliveryMemberCoordinates,
): Promise<DerivedCoordinates> {
  const { head, base } = await verifyMemberCommits(input, coordinates);

  const [diffBaseTree, headTree] = await Promise.all([
    readGit(input, ["rev-parse", `${base}^{tree}`], "unresolved-base"),
    readGit(input, ["rev-parse", `${head}^{tree}`], "non-commit-head"),
  ]);
  return { diffBaseSha: base, diffBaseTree, headSha: head, headTree };
}

/** Derive a canonical target from exact caller-held commits and repository-local identity. */
export async function deriveLocalReviewTargetFromCoordinates(input: {
  exec: GitExec;
  cwd: string;
  repositoryId: string;
  coordinates: ReviewTargetCoordinates;
}): Promise<ReviewTarget> {
  const coordinates = ReviewTargetCoordinatesSchema.parse(input.coordinates);
  const baseRef = coordinates.baseRef.trim();
  await readGit(input, ["check-ref-format", `refs/heads/${baseRef}`], "invalid-base");
  const derived = await resolveMemberCoordinates(input, coordinates);
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: coordinates.kind,
    repositoryId: input.repositoryId,
    baseRef,
    ...derived,
  });
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

function parsePorcelainPaths(stdout: string): string[] {
  const records = stdout.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length < 4) continue;
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (status.includes("R") || status.includes("C")) index += 1;
  }
  return [...new Set(paths)].sort();
}

/**
 * Confirm an unchanged reviewed head while allowing only named uncommitted fix paths.
 *
 * @param input - Git boundary, reviewed target, and authorized dirty path set.
 * @returns Current target evidence or a typed head/dirt refusal.
 */
export async function confirmLocalReviewCorrectionTarget(input: {
  exec: GitExec;
  cwd: string;
  attemptedTarget: ReviewTarget;
  expectedFixPaths: readonly string[];
}): Promise<LocalCorrectionTargetConfirmation> {
  const attemptedTarget = ReviewTargetSchema.parse(input.attemptedTarget);
  const currentHeadSha = await readGit(input, ["rev-parse", "--verify", "HEAD"], "unborn-repository");
  if (currentHeadSha !== attemptedTarget.headSha) {
    return { state: "stale-head", attemptedTarget, currentHeadSha };
  }
  const status = await readGit(
    input,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    "dirty-worktree",
  );
  const dirtyPaths = parsePorcelainPaths(status);
  const expected = new Set(input.expectedFixPaths);
  const unexpectedPaths = dirtyPaths.filter((path) => !expected.has(path));
  return unexpectedPaths.length === 0
    ? { state: "current", target: attemptedTarget, dirtyPaths }
    : { state: "unexpected-dirty-paths", target: attemptedTarget, unexpectedPaths };
}

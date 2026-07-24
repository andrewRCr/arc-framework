/** Canonical local Git target derivation for review preparation. */

import type { GitExec } from "../../../../lib/git/exec.js";
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

export interface LocalTargetDerivationInput {
  exec: GitExec;
  cwd: string;
  baseRef: string;
  repositoryId: string;
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

/**
 * Derives an exact review target from clean repository state.
 *
 * @param input - Repository-local Git boundary and trusted repository/base facts.
 * @returns The canonical target and its domain-separated identity.
 */
export async function deriveLocalReviewTarget(
  input: LocalTargetDerivationInput,
): Promise<ReviewTarget> {
  const baseRef = input.baseRef.trim();
  if (baseRef === "") throw new LocalTargetDerivationError("invalid-base");
  await readGit(input, ["check-ref-format", `refs/heads/${baseRef}`], "invalid-base");

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

  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: input.repositoryId,
    baseRef,
    diffBaseSha,
    diffBaseTree,
    headSha: head.oid,
    headTree,
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

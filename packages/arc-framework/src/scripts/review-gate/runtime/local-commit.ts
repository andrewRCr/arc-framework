/** Canonical local commit resolution for repository-only review launchers. */

import type { GitExec } from "../../../lib/git/exec.js";
import type { ApprovedDispositionSet } from "../core/disposition-records.js";
import {
  consumeFixAuthorization,
  type FixAuthorization,
  type FixAuthorizationConsumption,
} from "../core/fix-authorization.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import { queryFixAuthorizationSetMutability } from "../core/head-mutability.js";
import { digestAt, ReviewRecordValidationError } from "../core/validation.js";

/**
 * Resolve a local commit-ish to the canonical SHA consumed by exact-head guards.
 *
 * @param exec - Injected git process boundary.
 * @param commitish - Local revision expression such as `HEAD`, a branch, or an abbreviated SHA.
 * @returns The resolved 40-character commit SHA.
 */
export async function resolveLocalCommit(exec: GitExec, commitish: string): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${commitish}^{commit}`]));
  } catch {
    throw new ReviewRecordValidationError("reviewContext.proposedHead", "expected a resolvable local commit-ish");
  }
  return digestAt(stdout.trim(), "reviewContext.proposedHead", 40);
}

/**
 * Apply, verify, and persist one locally authorized review-fix increment.
 *
 * The injected commit operation remains responsible for the caller's commit interlock. The authorization is
 * checked before the first edit, and its consumption is created only after the interlock returns the resulting
 * exact target.
 *
 * @param input - Approved authorization, exact old target, actor, and prior consumption state.
 * @param operations - Mutation, affected-gate, interlocked commit, and exact-target boundaries.
 * @returns The exact new target and the authorization consumption that binds it.
 */
export async function runAuthorizedLocalFixIncrement(input: {
  authorization: FixAuthorization;
  availableAuthorizations?: readonly FixAuthorization[];
  dispositionState: ApprovedDispositionSet;
  oldTarget: ReviewTarget;
  priorConsumptions: readonly FixAuthorizationConsumption[];
  appliedBy: string;
  consumedAt: string;
}, operations: {
  readCurrentTarget(): Promise<ReviewTarget>;
  applyFix(): Promise<void>;
  runAffectedGates(): Promise<{ passed: boolean; verificationRefs: string[] }>;
  commit(): Promise<ReviewTarget>;
}): Promise<{ newTarget: ReviewTarget; consumption: FixAuthorizationConsumption }> {
  const currentTarget = await operations.readCurrentTarget();
  if (currentTarget.targetId !== input.oldTarget.targetId) throw new Error("local-fix-target-moved");
  const mutability = queryFixAuthorizationSetMutability({
    authorizations: input.availableAuthorizations ?? [input.authorization],
    requestedFixAuthorizationId: input.authorization.fixAuthorizationId,
    dispositionState: input.dispositionState,
    currentTarget,
    priorConsumptions: input.priorConsumptions,
  });
  if (mutability.kind === "refuse") throw new Error(`local-fix-${mutability.reason}`);
  await operations.applyFix();
  const verification = await operations.runAffectedGates();
  if (!verification.passed || verification.verificationRefs.length === 0) {
    throw new Error("local-fix-verification-failed");
  }
  const committedTarget = await operations.commit();
  const newTarget = await operations.readCurrentTarget();
  if (newTarget.targetId !== committedTarget.targetId) throw new Error("local-fix-commit-target-mismatch");
  const consumption = consumeFixAuthorization({
    authorization: input.authorization,
    oldTarget: currentTarget,
    newTarget,
    appliedBy: input.appliedBy,
    consumedAt: input.consumedAt,
    verificationRefs: verification.verificationRefs,
    priorConsumptions: input.priorConsumptions,
  });
  return { newTarget, consumption };
}

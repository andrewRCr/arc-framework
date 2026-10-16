/** Exact durable-admission validation before a frontline run may start or replay. */

import { canonicalize } from "../../../lib/kernel/index.js";
import type { FrontlineAdmission } from "../core/frontline-admission.js";
import { FrontlineAdmissionError } from "../core/frontline-admission-error.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneProgressState } from "../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import { readLaneProgressOwner } from "../lane-progress.js";

/** Require the exact target and an admission still retained by its durable lane owner. */
export async function readValidatedFrontlineAdmission(
  store: ReviewOperationStateStore,
  admission: FrontlineAdmission,
  target: ReviewTarget,
): Promise<LaneProgressState> {
  if (canonicalize(target) !== canonicalize(admission.target)) {
    throw new FrontlineAdmissionError("stale-target",
      "frontline ready admission is unavailable for this target; re-resolve the current target");
  }
  const owner = await readLaneProgressOwner(store, {
    lane: "frontline", repositoryId: target.repositoryId, headSha: target.headSha, lineage: admission.lineage,
  });
  const admitted = owner?.attempts.filter((attempt) => attempt.attemptId === admission.operationId
    && attempt.frontline !== undefined
    && canonicalize(attempt.frontline.admission) === canonicalize(admission)) ?? [];
  if (owner === null || admitted.length !== 1) {
    throw new FrontlineAdmissionError("missing-admission",
      "frontline ready admission is unavailable: it is missing, withdrawn, or superseded; re-resolve the target");
  }
  return owner;
}

/** Single-use authorization and consumption records for approved review fixes. */

import {
  canonicalDigest,
  sortByCanonicalBytes,
} from "../../../lib/kernel/index.js";
import {
  ApprovedDispositionSetSchema,
  type ApprovedDispositionSet,
} from "./disposition-records.js";
import { ReviewTargetSchema, type ReviewTarget } from "./gate-contract-v2-schema.js";
import {
  FixAuthorizationConsumptionSchema,
  FixAuthorizationFieldsSchema,
  FixAuthorizationPreimageSchema,
  FixAuthorizationSchema,
  type FixAuthorization,
  type FixAuthorizationConsumption,
  type FixAuthorizationPreimage,
} from "./fix-authorization-records.js";

export {
  FixAuthorizationConsumptionSchema,
  FixAuthorizationPreimageSchema,
  FixAuthorizationSchema,
  type FixAuthorization,
  type FixAuthorizationConsumption,
  type FixAuthorizationPreimage,
} from "./fix-authorization-records.js";

function authorizationPreimage(fields: Omit<FixAuthorization, "fixAuthorizationId">): FixAuthorizationPreimage {
  return FixAuthorizationPreimageSchema.parse({
    domain: "arc.review-gate.fix-authorization/v2",
    ...fields,
  });
}

/** Mint one pre-mutation authorization from an exact approved disposition set. */
export function createFixAuthorization(input: {
  dispositionState: ApprovedDispositionSet;
  oldTarget: ReviewTarget;
}): FixAuthorization {
  const state = ApprovedDispositionSetSchema.parse(input.dispositionState);
  const oldTarget = ReviewTargetSchema.parse(input.oldTarget);
  if (state.dispositionSet.targetId !== oldTarget.targetId) {
    throw new Error("fix authorization target does not match the approved disposition set");
  }
  const authorizedFindingIds = sortByCanonicalBytes(
    state.dispositionSet.findings
      .filter((finding) => finding.disposition === "fix")
      .map((finding) => finding.findingId),
  );
  if (authorizedFindingIds.length === 0) {
    throw new Error("non-fix dispositions cannot authorize a head update");
  }
  const fields = FixAuthorizationFieldsSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    oldTargetId: oldTarget.targetId,
    oldHeadSha: oldTarget.headSha,
    dispositionSetId: state.dispositionSet.dispositionSetId,
    authorizedFindingIds,
    authorizedBy: state.approval.approvedBy,
    authorizedAt: state.approval.approvedAt,
  });
  return validateFixAuthorization({
    ...fields,
    fixAuthorizationId: canonicalDigest(authorizationPreimage(fields)),
  });
}

/** Validate structure and recompute the authorization's semantic identity. */
export function validateFixAuthorization(input: unknown): FixAuthorization {
  const authorization = FixAuthorizationSchema.parse(input);
  const { fixAuthorizationId, ...fields } = authorization;
  if (canonicalDigest(authorizationPreimage(fields)) !== fixAuthorizationId) {
    throw new Error("fix authorization ID does not match its preimage");
  }
  return authorization;
}

/** Bind one unconsumed authorization to the actual verified old-to-new target transition. */
export function consumeFixAuthorization(input: {
  authorization: FixAuthorization;
  oldTarget: ReviewTarget;
  newTarget: ReviewTarget;
  appliedBy: string;
  consumedAt: string;
  verificationRefs: string[];
  priorConsumptions: readonly FixAuthorizationConsumption[];
}): FixAuthorizationConsumption {
  const authorization = validateFixAuthorization(input.authorization);
  const oldTarget = ReviewTargetSchema.parse(input.oldTarget);
  const newTarget = ReviewTargetSchema.parse(input.newTarget);
  const priorConsumptions = input.priorConsumptions.map((record) => FixAuthorizationConsumptionSchema.parse(record));
  if (priorConsumptions.some((record) => record.fixAuthorizationId === authorization.fixAuthorizationId)) {
    throw new Error("fix authorization has already been consumed");
  }
  if (authorization.oldTargetId !== oldTarget.targetId
    || authorization.oldHeadSha !== oldTarget.headSha
    || oldTarget.repositoryId !== newTarget.repositoryId
    || oldTarget.baseRef !== newTarget.baseRef
    || oldTarget.diffBaseSha !== newTarget.diffBaseSha
    || oldTarget.diffBaseTree !== newTarget.diffBaseTree) {
    throw new Error("fix authorization does not bind the actual target transition");
  }
  return FixAuthorizationConsumptionSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    fixAuthorizationId: authorization.fixAuthorizationId,
    dispositionSetId: authorization.dispositionSetId,
    oldTargetId: oldTarget.targetId,
    newTargetId: newTarget.targetId,
    oldHeadSha: oldTarget.headSha,
    newHeadSha: newTarget.headSha,
    appliedBy: input.appliedBy,
    consumedAt: input.consumedAt,
    verificationRefs: input.verificationRefs,
  });
}

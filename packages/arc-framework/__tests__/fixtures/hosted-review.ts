/** Faithful hosted admission and handle fixtures composed through production constructors. */

import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { LaneSubjectLineage } from
  "../../src/scripts/review-gate/core/lane-admission.js";
import {
  createHostedAdmission,
  type HostedArtifact,
  type HostedProgressVehicle,
  type HostedProviderId,
  type HostedRequestHandle,
  type HostedReviewCoverage,
  type HostedTarget,
} from "../../src/scripts/review-gate/hosted/request.js";

const objectId = (character: string): string => character.repeat(40);

export interface HostedHandleFixtureInput {
  readonly repositoryId?: string;
  readonly lineage?: LaneSubjectLineage;
  readonly logicalPass?: number;
  readonly provider?: HostedProviderId;
  readonly target?: HostedTarget;
  readonly requestedCoverage?: HostedReviewCoverage;
  readonly effectiveCoverage?: HostedReviewCoverage;
  readonly vehicle?: HostedProgressVehicle;
  readonly actorIdentity?: string;
  readonly artifact?: HostedArtifact;
}

/** Create a complete hosted handle whose admission matches every carried field. */
export function createHostedHandleFixture(
  input: HostedHandleFixtureInput = {},
): HostedRequestHandle {
  const repositoryId = input.repositoryId ?? "repo-1";
  const provider = input.provider ?? "coderabbit-pr";
  const requestedCoverage = input.requestedCoverage ?? "complete";
  const target = input.target ?? {
    repository: "owner/repo",
    pullRequest: 42,
    headSha: objectId("c"),
  };
  const deliveryVehicle = input.vehicle?.kind === "delivery-member" ? input.vehicle : undefined;
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: deliveryVehicle === undefined ? "change-set" : "delivery-member",
    repositoryId,
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: target.headSha,
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"e".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "hosted", qualifier: provider }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("hosted fixture requires a review obligation");
  const lineage = input.lineage ?? (deliveryVehicle === undefined
    ? input.vehicle?.kind === "errand"
      ? {
          kind: "head-bound" as const,
          vehicleKind: "errand",
          vehicleIdentity: input.vehicle.claimId,
          headSha: target.headSha,
        }
      : { kind: "candidate" as const, candidateId: `sha256:${"f".repeat(64)}` }
    : {
        kind: "delivery-member" as const,
        planId: deliveryVehicle.planId,
        workUnitId: deliveryVehicle.workUnitId,
        deliverableId: deliveryVehicle.deliverableId,
      });
  const admission = createHostedAdmission({
    schemaVersion: 1,
    repositoryId,
    lineage,
    logicalPass: input.logicalPass ?? 1,
    sourceId: provider,
    target,
    requestedCoverage,
    ...(input.vehicle === undefined ? {} : { vehicle: input.vehicle }),
    reviewTarget,
    requirement,
    actorIdentity: input.actorIdentity ?? "github-user-1",
  });
  return {
    schemaVersion: 1,
    provider,
    requestedCoverage,
    effectiveCoverage: input.effectiveCoverage ?? requestedCoverage,
    target,
    artifact: input.artifact ?? {
      kind: "issue-comment",
      id: "comment-1",
      url: "https://example.invalid/comment-1",
      createdAt: "2026-08-15T11:00:00Z",
    },
    ...(input.vehicle === undefined ? {} : { vehicle: input.vehicle }),
    admission,
  };
}

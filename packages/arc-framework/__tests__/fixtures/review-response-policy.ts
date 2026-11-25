/** Canonical policy input fixture derived from one persisted response producer. */

import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { gitExec } from "../../src/lib/io-context.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { parseReviewSourceReference } from
  "../../src/scripts/review-gate/core/review-source-reference.js";
import type { ReviewInFlightPort } from "../../src/scripts/review-gate/core/ports.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import type { OwnerIdentity } from "../../src/lib/store/identity.js";
import {
  ReviewPolicyCommandRequestSchema,
  type ReviewPolicyCommandRequest,
} from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import type { StandardReviewObligationProjection } from
  "../../src/scripts/review-gate/policy/standard-review-projection-schema.js";

export type ResponsePolicySource =
  | { kind: "attested-local"; receiptRef: string }
  | { kind: "hosted"; attemptRef: string };

interface ResponsePolicyRequestFixtureInput {
  readonly headSha: string;
  readonly lane?: "frontline" | "standard";
  readonly repository?: string;
  readonly pullRequest?: number | null;
  readonly sourceId?: string;
  readonly reviewOperationId?: string;
  readonly completedPasses?: number;
  readonly standardReview?: StandardReviewObligationProjection;
  readonly scopeSelection?: ReviewPolicyCommandRequest["scopeSelection"];
}

/** Build a valid policy continuation for record-focused tests. */
export function responsePolicyRequestFixture(
  input: ResponsePolicyRequestFixtureInput,
): ReviewPolicyCommandRequest {
  return ReviewPolicyCommandRequestSchema.parse({
    schemaVersion: 1,
    target: {
      repository: input.repository ?? "owner/repo",
      pullRequest: input.pullRequest ?? null,
      headSha: input.headSha,
    },
    lane: input.lane ?? "standard",
    frontlineActive: false,
    standardReview: input.standardReview ?? {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"1".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    completedPasses: input.completedPasses ?? 1,
    ...(input.scopeSelection === undefined ? {} : { scopeSelection: input.scopeSelection }),
    attempts: [{
      sourceId: input.sourceId ?? "delegated-agent",
      outcome: "findings",
      reviewOperationId: input.reviewOperationId ?? "operation-1",
      ...(input.scopeSelection?.mode === "chunked" ? { chunkSeriesComplete: true } : {}),
    }],
  });
}

/** The review operations a checkout records: the store's for a work item it holds, otherwise the in-repo store's
 * machine-local operations.
 * @param root - The checkout the review ran in.
 * @param workItem - The work item the store's operations belong to, absent for the in-repo store.
 * @returns The operation port.
 */
export function reviewInFlight(root: string, workItem?: OwnerIdentity): ReviewInFlightPort {
  return workItem === undefined
    ? new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(gitExec, root))
    : createReviewCompositionContext({ cwd: root, exec: gitExec, workItem }).family.ports.inFlight;
}

/** Derive the exact policy request a public response replay carries from its immutable producer. */
export async function responsePolicyRequest(
  root: string,
  source: ResponsePolicySource,
  repository = "owner/repo",
): Promise<ReviewPolicyCommandRequest> {
  // A store's reference names the work item whose records hold its producer.
  const bound = source.kind === "attested-local"
    ? parseReviewSourceReference(source.receiptRef, source.kind, true)
    : parseReviewSourceReference(source.attemptRef, source.kind, true);
  if ("workItem" in bound) return storedResponsePolicyRequest(root, bound.workItem, bound.durableRef, repository);
  const { state } = await reviewInFlight(root).readOperation(bound.operationId);
  if (state === null) throw new Error("response policy source operation is unavailable");
  const producer = state.kind === "local-review"
    ? {
        headSha: state.target.headSha,
        sourceId: state.laneSourceId,
        operationId: state.operationId,
        logicalPass: state.logicalPass,
        requirement: state.requirement,
        pullRequest: state.deliveryAdmission?.target.pullRequest ?? null,
        scopeSelection: state.deliveryAdmission?.scopeSelection,
      }
    : state.kind === "lane-progress"
      ? (() => {
          const attempt = state.attempts.find((candidate) =>
            candidate.attemptId === bound.durableRef && candidate.hosted !== undefined);
          if (attempt?.hosted === undefined) throw new Error("hosted response producer is unavailable");
          return {
            headSha: attempt.headSha,
            sourceId: attempt.sourceId,
            operationId: attempt.attemptId,
            logicalPass: attempt.logicalPass,
            requirement: attempt.hosted.requirement,
            pullRequest: attempt.hosted.target.pullRequest,
            scopeSelection: undefined,
          };
        })()
      : null;
  if (producer === null) throw new Error("response policy source is not a lane producer");
  return responsePolicyRequestFixture({
    repository,
    pullRequest: producer.pullRequest,
    headSha: producer.headSha,
    sourceId: producer.sourceId,
    reviewOperationId: producer.operationId,
    completedPasses: producer.logicalPass,
    scopeSelection: producer.scopeSelection,
    standardReview: {
      obligation: producer.requirement.obligation,
      reasons: producer.requirement.reasons,
      rubricVersion: producer.requirement.rubricVersion,
      rubricDigest: producer.requirement.rubricDigest,
      retrigger: producer.requirement.retrigger,
      count: producer.requirement.count,
    },
  });
}

/** The stored outcome carries the producer's target, scope and review requirement. */
async function storedResponsePolicyRequest(
  root: string, workItem: OwnerIdentity, attemptId: string, repository: string,
): Promise<ReviewPolicyCommandRequest> {
  const family = createReviewCompositionContext({ cwd: root, exec: gitExec, workItem }).family;
  if (family.mode !== "stored") throw new Error("a store's response source needs the store");
  const response = await family.ports.responses.read(attemptId, "producer-result");
  if (response.status === "missing-producer") throw new Error("response policy source outcome is unavailable");
  const outcome = response.outcome.value;
  const requirement = outcome.hosted?.requirement ?? outcome.requirement;
  if (outcome.source.kind === "frontline" || requirement === undefined) {
    throw new Error(`the store's ${outcome.source.kind} response producer is not composed here`);
  }
  const target = outcome.local?.deliveryAdmission?.target ?? outcome.hosted?.target ?? {
    repository, pullRequest: null, headSha: outcome.target.headSha,
  };
  return responsePolicyRequestFixture({
    ...target,
    scopeSelection: outcome.local === undefined ? undefined : { mode: outcome.local.scopeMode, target },
    sourceId: outcome.source.sourceId,
    reviewOperationId: outcome.attemptId,
    completedPasses: outcome.logicalPass,
    standardReview: {
      obligation: requirement.obligation,
      reasons: requirement.reasons,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      retrigger: requirement.retrigger,
      count: requirement.count,
    },
  });
}

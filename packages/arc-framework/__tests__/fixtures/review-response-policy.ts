/** Canonical policy input fixture derived from one persisted response producer. */

import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { gitExec } from "../../src/lib/io-context.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { parseReviewSourceReference } from
  "../../src/scripts/review-gate/core/review-source-reference.js";
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
    attempts: [{
      sourceId: input.sourceId ?? "delegated-agent",
      outcome: "findings",
      reviewOperationId: input.reviewOperationId ?? "operation-1",
    }],
  });
}

/** Derive the exact policy request a public response replay carries from its immutable producer. */
export async function responsePolicyRequest(
  root: string,
  source: ResponsePolicySource,
  repository = "owner/repo",
) {
  const bound = source.kind === "attested-local"
    ? parseReviewSourceReference(source.receiptRef, source.kind)
    : parseReviewSourceReference(source.attemptRef, source.kind);
  const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
  const { state } = await new LocalReviewOperationStateStore(publisher).readOperation(bound.operationId);
  if (state === null) throw new Error("response policy source operation is unavailable");
  const producer = state.kind === "local-review"
    ? {
        headSha: state.target.headSha,
        sourceId: state.laneSourceId,
        operationId: state.operationId,
        logicalPass: state.logicalPass,
        requirement: state.requirement,
        pullRequest: null,
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

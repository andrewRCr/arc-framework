/** Explicit singleton source selection through contribution applicability discharge. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { CandidateReviewApplicabilitySelectionV1Schema } from
  "../../../../../src/lib/work-unit/candidate-attestation.js";
import { composeSingletonReviewObligation } from "../../../../../src/scripts/review-gate/status.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectHostedReservationDischarge } from
  "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import type { EarlierHostedAttemptApplicabilityRead } from
  "../../../../../src/scripts/review-gate/policy/earlier-review-applicability.js";
import { classifyReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import { reduceReviewApplicabilityAuthority, reviewApplicabilityConsumerAction } from
  "../../../../../src/scripts/review-gate/policy/review-applicability-authority.js";

const oid = (character: string): string => character.repeat(40);
const candidateId = canonicalDigest({ candidate: 1 });
const reservation = createStandardReviewReservation({
  candidateId,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  repository: "owner/repo",
  headSha: oid("a"),
  obligation: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: 1 }),
    retrigger: "full-final",
    count: 1,
  },
});
const target = { repository: "owner/repo", pullRequest: 42, headSha: oid("b") };
const projection = classifyReviewContributionApplicability({
  schemaVersion: 1,
  repositoryId: "repo-1",
  repository: target.repository,
  pullRequest: target.pullRequest,
  lane: "standard",
  sourceId: "codex-pr",
  priorAttemptId: "hosted/prior-codex",
  priorHead: oid("a"),
  currentHead: target.headSha,
  priorBase: oid("0"),
  currentBase: oid("0"),
}, {
  endpoints: {
    before: {
      predecessor: { head: oid("0"), tree: oid("1") },
      member: { head: oid("a"), tree: oid("2") },
    },
    after: {
      predecessor: { head: oid("0"), tree: oid("1") },
      member: { head: target.headSha, tree: oid("3") },
    },
  },
  proof: { status: "refused", reason: "contribution-diverged", paths: ["src/index.ts"] },
});
if (projection.state !== "decision-required") throw new Error("expected changed contribution");
const decisionProjection = projection;

function earlierApplicability(choice?: "review-required") {
  const selections = choice === undefined ? [] : [CandidateReviewApplicabilitySelectionV1Schema.parse({
    transitionKind: "review-applicability-selection",
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId,
    selector: projection.selector,
    projectionDigest: decisionProjection.projectionDigest,
    residualDigest: decisionProjection.residualDigest,
    selectedBy: "owner",
    selectedAt: "2026-10-03T00:00:00Z",
    choice,
  })];
  const authority = reduceReviewApplicabilityAuthority(candidateId, projection, selections);
  return async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead> => sourceId !== "codex-pr"
    ? { status: "not-found" }
    : {
        status: "complete",
        attempts: [{
          operationId: "lane-progress/prior-codex",
          attemptId: projection.selector.priorAttemptId,
          logicalPass: 1,
          updatedAt: "2026-10-02T00:00:00Z",
          scopeMode: "whole-target",
          sourceId,
          outcome: "settled-findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: reviewApplicabilityConsumerAction(authority),
          projection,
          ...(authority.state === "decision-required" ? { authorityState: authority.state } : {}),
        }],
      };
}

const unreachableTerminalPolicy = async (): Promise<never> => {
  throw new Error("an unresolved or review-required contribution has no retained terminal policy");
};
const dischargeInput = {
  reservation,
  span: [target.headSha],
  target,
  readLaneProgress: async () => ({ status: "unrecorded" as const }),
  resolveTerminalPolicy: unreachableTerminalPolicy,
  resolveEarlierTerminalPolicy: unreachableTerminalPolicy,
};

describe("singleton forced-source applicability", () => {
  it("offers Codex's unresolved residual before any selected hosted request", async () => {
    const discharge = await projectHostedReservationDischarge({
      ...dischargeInput,
      invocation: { mode: "force", sourceId: "codex-pr" },
      readEarlierAttemptApplicability: earlierApplicability(),
    });
    expect(discharge).toMatchObject({
      discharged: false,
      nextSource: null,
      applicability: projection,
      applicabilityAuthority: "decision-required",
    });
    expect(composeSingletonReviewObligation({
      discharge,
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 1 }),
        candidateId,
      },
    })).toMatchObject({
      state: "review-required",
      scope: "singleton",
      selectionAction: { projection, choices: ["covered", "review-required"] },
    });
  });

  it("requests Codex after the exact Owner choice requires review", async () => {
    await expect(projectHostedReservationDischarge({
      ...dischargeInput,
      invocation: { mode: "force", sourceId: "codex-pr" },
      readEarlierAttemptApplicability: earlierApplicability("review-required"),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: "codex-pr",
      detail: expect.stringContaining("Owner selection"),
    });
  });

  it("refuses a selected source outside the canonical reservation", async () => {
    await expect(projectHostedReservationDischarge({
      ...dischargeInput,
      invocation: { mode: "force", sourceId: "unconfigured" },
      readEarlierAttemptApplicability: earlierApplicability(),
    })).rejects.toThrow("not a configured standard-review source");
  });
});

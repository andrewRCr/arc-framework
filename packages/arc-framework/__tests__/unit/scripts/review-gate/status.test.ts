/** Exact-target review status reduction. */

import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../helpers/schema-assertion.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";
import { createReviewTarget } from
  "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { classifyReviewContributionApplicability } from
  "../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import { DeliveryLocalReviewSelectionSchema } from
  "../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { resolveReviewPolicy } from
  "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { composePublishedSingletonReview } from
  "../../../../src/scripts/review-gate/status-singleton.js";
import {
  bindDeliveryReviewTerminusOffer,
  composeDeliveryReviewObligation,
  composeSingletonReviewObligation,
  ReviewStatusResultSchema,
  ReviewStatusWorkUnitInputSchema,
  RoutedReviewObligationSchema,
  resolveReviewStatus,
  type ReviewStatusObservation,
  type ReviewStatusPort,
} from "../../../../src/scripts/review-gate/status.js";

const oid = (character: string): string => character.repeat(40);
const target = { repository: "owner/repo", headRef: "feat/example", headSha: oid("a") };
const memberVehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"c".repeat(64)}`,
  workUnitId: "example",
  head: oid("c"),
});
const hostedAction = {
  schemaVersion: 1 as const,
  target: { repository: "owner/repo", pullRequest: 41, headSha: memberVehicle.head },
  provider: "coderabbit-pr" as const,
  coverage: "complete" as const,
  vehicle: memberVehicle,
};
const hostedAwaitAction = {
  schemaVersion: 1 as const,
  handle: createHostedHandleFixture({
    provider: hostedAction.provider,
    requestedCoverage: hostedAction.coverage,
    effectiveCoverage: hostedAction.coverage,
    target: hostedAction.target,
    artifact: {
      kind: "issue-comment" as const,
      id: "request-41",
      url: "https://example.test/request-41",
      createdAt: "2026-09-01T12:00:00.000Z",
    },
    vehicle: memberVehicle,
  }),
};
type DeliveryTargetInput = Parameters<typeof composeDeliveryReviewObligation>[0]["targets"][number];
type DeliveryDischargeInput = Parameters<typeof composeDeliveryReviewObligation>[0]["discharges"][number];

function deliveryTarget(
  exactTarget: typeof hostedAction.target,
  vehicle = memberVehicle,
  position = 1,
  memberCount = 1,
): DeliveryTargetInput {
  return {
    ...exactTarget,
    vehicle,
    position,
    memberCount,
    chunkKey: `member-${String(position)}`,
    title: `Member ${String(position)}`,
  };
}

function deliveryDischarge(
  input: Omit<DeliveryDischargeInput, "completedPasses" | "completePasses" | "passCeiling" | "attemptHistory">
    & Partial<Pick<
      DeliveryDischargeInput,
      "completedPasses" | "completePasses" | "passCeiling" | "attemptHistory"
    >>,
): DeliveryDischargeInput {
  return {
    completedPasses: 0,
    completePasses: 0,
    passCeiling: 2,
    attemptHistory: [],
    ...input,
  };
}

const conjunctionMemberProgress = {
  completedPasses: 0,
  completePasses: 0,
  passCeiling: 2,
  attempts: [],
};
const hostedResponsePlan = {
  schemaVersion: 1 as const,
  target: createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repository-1",
    baseRef: "main",
    diffBaseSha: oid("1"),
    diffBaseTree: oid("2"),
    headSha: oid("a"),
    headTree: oid("3"),
  }),
  source: {
    kind: "hosted" as const,
    attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
  },
  findings: [{
    findingId: "finding-prior",
    severity: "major" as const,
    locus: "src/example.ts:1",
    evidenceUrlOrId: "https://example.test/finding-prior",
    sourceOrdinal: 1,
  }],
};

function readyAdmission(
  sourceId: "coderabbit-pr" | "codex-pr",
  admissionTarget = hostedAction.target,
  completedPasses = 0,
) {
  return resolveReviewPolicy({
    schemaVersion: 1,
    target: admissionTarget,
    lane: "standard",
    standardReview: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"e".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    sources: [sourceId],
    maxPasses: 2,
    completedPasses,
    attempts: [],
  });
}

function reviewApplicabilityDecision(priorAttemptId = "attempt-prior") {
  const priorVehicle = DeliveryReviewMemberVehicleSchema.parse({
    ...memberVehicle,
    head: oid("a"),
  });
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: hostedAction.target.repository,
    pullRequest: hostedAction.target.pullRequest,
    lane: "standard" as const,
    sourceId: hostedAction.provider,
    priorAttemptId,
    priorHead: priorVehicle.head,
    currentHead: memberVehicle.head,
    priorBase: oid("1"),
    currentBase: oid("2"),
    priorVehicle,
    currentVehicle: memberVehicle,
  };
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: oid("1"), tree: oid("3") },
        member: { head: priorVehicle.head, tree: oid("4") },
      },
      after: {
        predecessor: { head: oid("2"), tree: oid("5") },
        member: { head: memberVehicle.head, tree: oid("6") },
      },
    },
    proof: {
      status: "refused",
      reason: "contribution-diverged",
      paths: ["packages/arc-framework/src/example.ts"],
    },
  });
  if (projection.state !== "decision-required") throw new Error("expected review applicability decision");
  return projection;
}

function blockedApplicability(
  reason: "rerun" | "failed" | "unsupported" | "unavailable",
) {
  const decision = reviewApplicabilityDecision();
  if (reason === "unavailable") {
    return classifyReviewContributionApplicability(decision.selector, null);
  }
  return classifyReviewContributionApplicability(decision.selector, {
    endpoints: decision.projection,
    proof: reason === "rerun"
      ? { status: "refused", reason: "contribution-endpoints-unverified" }
      : reason === "failed"
        ? { status: "refused", reason: "git-failure" }
        : { status: "refused", reason: "merge-tree-write-tree-unsupported" },
  });
}

function port(overrides: Partial<ReviewStatusObservation> = {}): ReviewStatusPort {
  return {
    observe: async () => ({
      actualHeadSha: target.headSha,
      requiredChecks: "green",
      routedObligation: { state: "settled", detail: "The routed review obligation is settled." },
      currentBaseOid: oid("b"),
      baseContained: true,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
      ...overrides,
    }),
  };
}

describe("review status", () => {
  it("accepts the delegated carrier named by a coverage-selection action", () => {
    assertSchemaAccepts(ReviewStatusWorkUnitInputSchema, {
      workUnitId: "example",
      coverage: "incremental",
      sourceId: "delegated-agent",
    });
  });

  it("rejects a stale target reference", async () => {
    await expect(resolveReviewStatus({ target }, port({ actualHeadSha: oid("f") }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "stale-target",
      target,
      remedy: {
        argv: [
          "arc", "review", "change-request", "resolve",
          "--head-ref", target.headRef,
          "--head-sha", oid("f"),
        ],
      },
    });
  });

  it("routes a newly advanced base back through the checkpoint", async () => {
    await expect(resolveReviewStatus({ target }, port({
      baseContained: false,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: {
          status: "available",
          substantivePaths: ["src/shared.ts"],
          regenerablePaths: [],
        },
      },
    }))).resolves.toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      currentBaseOid: oid("b"),
      movement: "overlapping",
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: {
          status: "available",
          substantivePaths: ["src/shared.ts"],
          regenerablePaths: [],
        },
      },
      terminalExplanation: "The target-only status request cannot identify a work unit for checkpoint rerun.",
    });
  });

  it("routes a resolved singleton base movement through its work-unit checkpoint", async () => {
    await expect(resolveReviewStatus({ target }, port({
      workUnitId: "example",
      baseContained: false,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: {
          status: "available",
          substantivePaths: ["src/shared.ts"],
          regenerablePaths: [],
        },
      },
    }))).resolves.toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      checkpointAction: { command: "rerun-checkpoint", workUnit: "example" },
    });
  });

  it("retains a settled attempt across disjoint non-contained base movement", async () => {
    await expect(resolveReviewStatus({ target }, port({ baseContained: false }))).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      movement: "disjoint",
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    });
  });

  it("reruns the checkpoint with precise unavailable movement evidence", async () => {
    const detail = "The merge base could not be established for the exact revisions.";
    await expect(resolveReviewStatus({ target }, port({
      baseContained: false,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: { status: "unavailable", reason: "merge-base-failed" },
      },
      baseMovementDetail: detail,
    }))).resolves.toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      movement: "unknown",
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: { status: "unavailable", reason: "merge-base-failed" },
      },
      baseMovementDetail: detail,
      terminalExplanation: "The target-only status request cannot identify a work unit for checkpoint rerun.",
    });
  });

  it("preserves the settled result when the observed base is contained", async () => {
    await expect(resolveReviewStatus({ target }, port({
      baseContained: true,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: {
          status: "available",
          substantivePaths: ["src/shared.ts"],
          regenerablePaths: [],
        },
      },
    }))).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      movement: "overlapping",
    });
  });

  it("routes an unsettled review obligation to review", async () => {
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: { state: "review-required", detail: "Hosted review remains required." },
    }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "run-review",
      routedObligation: { state: "review-required" },
    });
  });

  it("carries the host's blocking reviews without changing the status action", async () => {
    const hostReview = {
      state: "changes-requested" as const,
      blockingReviews: [{
        reviewId: 5395474284,
        author: "coderabbitai",
        commitSha: oid("c"),
        submittedAt: "2026-10-02T18:43:15Z",
      }],
    };

    await expect(resolveReviewStatus({ target }, port({ hostReview }))).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      hostReview,
    });
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: { state: "review-required", detail: "Hosted review remains required." },
      hostReview,
    }))).resolves.toMatchObject({ state: "review-required", nextAction: "run-review", hostReview });
  });

  it("reports host review as unavailable when the observation did not read it", async () => {
    await expect(resolveReviewStatus({ target }, port())).resolves.toMatchObject({
      hostReview: { state: "unavailable", detail: "The host's review state was not read for this target." },
    });
  });

  it("returns a complete hosted request for an admitted singleton PR", async () => {
    const exactTarget = { repository: target.repository, pullRequest: 41, headSha: target.headSha };
    const obligation = composeSingletonReviewObligation({
      discharge: { discharged: false, detail: "Reserved review is outstanding." },
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 1 }),
        candidateId: canonicalDigest({ candidate: 1 }),
      },
      request: {
        target: exactTarget,
        admission: readyAdmission("coderabbit-pr", exactTarget),
        sourceId: "coderabbit-pr",
        coverage: "complete",
      },
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        schemaVersion: 1,
        target: exactTarget,
        provider: "coderabbit-pr",
        coverage: "complete",
      },
    });
    expect(obligation).not.toHaveProperty("conjunction");
    if ("action" in obligation) expect(obligation.action).not.toHaveProperty("vehicle");
  });

  it("returns the exact pass-ceiling consequence for an exhausted singleton reservation", async () => {
    const exactTarget = { repository: target.repository, pullRequest: 41, headSha: target.headSha };
    const obligation = composeSingletonReviewObligation({
      discharge: { discharged: false, detail: "Reserved review still needs a pass." },
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 1 }),
        candidateId: canonicalDigest({ candidate: 1 }),
      },
      request: {
        target: exactTarget,
        admission: readyAdmission("coderabbit-pr", exactTarget, 2),
        sourceId: "coderabbit-pr",
        coverage: "complete",
      },
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: { target: exactTarget, exhaustedPassCount: 2, nextPass: 3 },
    });
  });

  it("routes an ordinary moved-head residual to one Candidate applicability selection", async () => {
    const projection = reviewApplicabilityDecision();
    const selectionAction = {
      schemaVersion: 1 as const,
      kind: "review-applicability-selection" as const,
      workUnitId: "example",
      expectedRecordVersion: canonicalDigest({ version: 2 }),
      candidateId: canonicalDigest({ candidate: 2 }),
      projection,
      choices: ["covered", "review-required"] as const,
      interactionText: "Choose whether the exact residual is already covered.",
    };
    const obligation = composeSingletonReviewObligation({
      discharge: {
        discharged: false,
        detail: "The prior ordinary review has an uncovered residual.",
        applicability: projection,
      },
      applicabilityContext: {
        workUnitId: selectionAction.workUnitId,
        expectedRecordVersion: selectionAction.expectedRecordVersion,
        candidateId: selectionAction.candidateId,
      },
    });

    await expect(resolveReviewStatus({ target }, port({
      routedObligation: obligation,
    }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
      selectionAction: {
        ...selectionAction,
        interactionText: expect.any(String),
      },
    });
  });

  it("offers prior-pass applicability using the observed singleton diff base", async () => {
    const observedBases: string[] = [];
    const projection = reviewApplicabilityDecision();
    const readDischarge = Object.assign(async (request: { baseRevision: string }) => {
      observedBases.push(request.baseRevision);
      return {
        discharged: false as const,
        detail: "The prior hosted pass needs an applicability decision.",
        nextSource: null,
        applicability: projection,
      };
    }, { confirmIncrementalApplicability: async () => "applicable" as const });
    const obligation = await composePublishedSingletonReview({
      cwd: "/repo",
      exec: (() => Promise.reject(new Error("unexpected Git read"))) as never,
      settings: {} as never,
      reservation: {} as never,
      record: { attestation: { baseRevision: oid("1"), candidateId: canonicalDigest({ candidate: 2 }) } } as never,
      recordVersion: canonicalDigest({ version: 2 }),
      baseRevision: oid("2"),
      workUnit: "example",
      target: { repository: target.repository, pullRequest: 41, headSha: target.headSha },
      readDischarge,
    });

    expect(observedBases).toEqual([oid("2")]);
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
    });
  });

  it("rejects a delivery applicability intervention whose conjunction is missing", () => {
    const projection = reviewApplicabilityDecision();
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The prior member review has an uncovered residual.",
        nextSource: null,
        applicability: projection,
      })],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 2 }),
        candidateId: canonicalDigest({ candidate: 2 }),
      },
    });
    if (!("conjunction" in obligation) || !("selectionAction" in obligation)) {
      throw new Error("expected delivery applicability intervention");
    }
    const withoutConjunction = {
      state: obligation.state,
      detail: obligation.detail,
      selectionAction: obligation.selectionAction,
    };

    assertSchemaRefuses(RoutedReviewObligationSchema, withoutConjunction);
  });

  it.each([
    ["rerun", "applicability-rerun", "rerun-checkpoint", undefined],
    ["failed", "blocked", "stop", "applicability-failed"],
    ["unsupported", "applicability-unsupported", "upgrade", undefined],
    ["unavailable", "blocked", "stop", "applicability-unavailable"],
  ] as const)(
    "preserves an ordinary moved-head %s stop through review status",
    async (kind, state, nextAction, reason) => {
      const applicability = blockedApplicability(kind);
      const obligation = composeSingletonReviewObligation({
        discharge: {
          discharged: false,
          detail: `Ordinary applicability ${kind}.`,
          applicability,
        },
        applicabilityContext: {
          workUnitId: "example",
          expectedRecordVersion: canonicalDigest({ version: 2 }),
          candidateId: canonicalDigest({ candidate: 2 }),
        },
      });

      await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
        state,
        nextAction,
        applicability,
        ...(reason === undefined ? {} : { reason }),
      });
    },
  );

  it("preserves a conflicting ordinary Candidate selection as a typed stop", async () => {
    const applicability = reviewApplicabilityDecision();
    const obligation = composeSingletonReviewObligation({
      discharge: {
        discharged: false,
        detail: "Conflicting Candidate applicability selections require correction.",
        applicability,
        applicabilityAuthority: "blocked",
      },
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 2 }),
        candidateId: canonicalDigest({ candidate: 2 }),
      },
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "applicability-selection-conflict",
      applicability,
    });
  });

  it("routes retained ordinary hosted findings before another review", async () => {
    const obligation = composeSingletonReviewObligation({
      discharge: {
        discharged: false,
        detail: "The ordinary hosted source has retained findings.",
        responsePlan: hostedResponsePlan,
      },
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 2 }),
        candidateId: canonicalDigest({ candidate: 2 }),
      },
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "respond-to-findings",
      responsePlan: hostedResponsePlan,
    });
  });

  it("routes retained ordinary local findings through the exact operation", async () => {
    const localResumeAction = { schemaVersion: 1 as const, operationId: "local-review/prior" };
    const obligation = composeSingletonReviewObligation({
      discharge: {
        discharged: false,
        detail: "The ordinary standard source has retained findings.",
        localResumeAction,
      },
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 2 }),
        candidateId: canonicalDigest({ candidate: 2 }),
      },
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-local-resume",
      action: localResumeAction,
    });
  });

  it("returns the complete hosted request selected for the first outstanding delivery member", async () => {
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: {
        state: "review-required",
        detail: "The first delivery member remains outstanding.",
        conjunction: {
          kind: "delivery",
          status: "outstanding",
          members: [{
            position: 1,
            memberCount: 1,
            chunkKey: memberVehicle.workUnitId,
            title: "Member 1",
            target: hostedAction.target,
            vehicle: memberVehicle,
            state: "outstanding",
            detail: "Hosted review remains required.",
            progress: conjunctionMemberProgress,
          }],
        },
        action: hostedAction,
      },
    }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: hostedAction,
      routedObligation: {
        conjunction: { kind: "delivery", status: "outstanding" },
      },
      deliveryCursor: {
        status: "outstanding",
        completedMemberCount: 0,
        memberCount: 1,
        currentMember: {
          position: 1,
          title: "Member 1",
          progress: conjunctionMemberProgress,
        },
      },
    });
  });

  it("returns the exact durable hosted await for the first outstanding delivery member", async () => {
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The hosted request is pending.",
        nextSource: null,
        awaitAction: hostedAwaitAction,
      })],
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-await",
      action: hostedAwaitAction,
      deliveryCursor: {
        status: "outstanding",
        completedMemberCount: 0,
        currentMember: { position: 1 },
      },
    });
  });

  it("returns the exact retained findings response before another hosted request", async () => {
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The earlier findings attempt remains unsettled.",
        nextSource: null,
        responsePlan: hostedResponsePlan,
      })],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      responsePlan: hostedResponsePlan,
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "respond-to-findings",
      responsePlan: hostedResponsePlan,
    });
  });

  it("routes the driver's exact member-pass ceiling consequence without another request", async () => {
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["coderabbit-pr", "codex-pr"],
      maxPasses: 2,
      completedPasses: 2,
      attempts: [],
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member has exhausted its configured review passes.",
        nextSource: "coderabbit-pr",
        requestAdmission: policy,
      })],
    });

    expect(obligation).toMatchObject({
      state: "approval-required",
      consequence: {
        target: hostedAction.target,
        lane: "standard",
        exhaustedPassCount: 2,
        nextPass: 3,
      },
    });
    if (obligation.state !== "approval-required") throw new Error("expected ceiling approval");
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: obligation.consequence,
    });
  });

  it("routes an Errand claim ceiling without a delivery member", async () => {
    const consequence = {
      target: { repository: target.repository, pullRequest: 42, headSha: target.headSha },
      lane: "standard" as const, exhaustedPassCount: 2, nextPass: 3,
    };
    const obligation = RoutedReviewObligationSchema.parse({
      state: "approval-required", scope: "errand",
      detail: "The Errand claim used two passes.", consequence,
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "approval-required", nextAction: "obtain-ceiling-override", consequence,
      routedObligation: { scope: "errand" },
    });
  });

  it("reports logical and complete member-pass counts independently", () => {
    const discharge = {
      ...deliveryDischarge({
        discharged: false,
        detail: "The member still needs complete coverage.",
        nextSource: "coderabbit-pr",
        requestAdmission: readyAdmission("coderabbit-pr"),
        completedPasses: 2,
      }),
      completePasses: 1,
    };
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [discharge],
    });

    expect(obligation).toMatchObject({
      conjunction: {
        members: [{ progress: { completedPasses: 2, completePasses: 1 } }],
      },
    });
  });

  it("binds a ceiling stop to one submit-ready exact member terminus offer", async () => {
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["coderabbit-pr"],
      maxPasses: 2,
      completedPasses: 2,
      attempts: [],
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member has exhausted its configured review passes.",
        nextSource: "coderabbit-pr",
        requestAdmission: policy,
        completedPasses: 2,
      })],
    });
    const status = await resolveReviewStatus({ target }, port({ routedObligation: obligation }));

    expect(bindDeliveryReviewTerminusOffer(status, {
      workUnitId: "example",
      remote: "upstream",
      expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    })).toMatchObject({
      nextAction: "obtain-ceiling-override",
      terminusAction: {
        schemaVersion: 1,
        offer: {
          kind: "delivery-member-owner-terminus",
          workUnitId: "example",
          remote: "upstream",
          target: hostedAction.target,
          vehicle: memberVehicle,
          completedPasses: 2,
        },
      },
    });
  });

  it("retains the exact member terminus offer while base movement awaits checkpoint", async () => {
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member remains eligible for another hosted pass.",
        nextSource: "coderabbit-pr",
        requestAdmission: readyAdmission("coderabbit-pr"),
        completedPasses: 1,
        attemptHistory: [{
          updatedAt: "2026-09-02T12:00:00.000Z",
          headSha: memberVehicle.head,
          sourceId: "coderabbit-pr",
          outcome: "settled-findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          findingCount: 1,
          settledFindingCount: 1,
        }],
      })],
    });
    const status = await resolveReviewStatus({ target }, port({
      routedObligation: obligation,
      baseContained: false,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 42,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: {
          status: "available",
          substantivePaths: ["src/shared.ts"],
          regenerablePaths: [],
        },
      },
    }));

    expect(bindDeliveryReviewTerminusOffer(status, {
      workUnitId: "example",
      expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    })).toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      movement: "overlapping",
      checkpointAction: { command: "rerun-checkpoint", workUnit: "example" },
      terminusAction: {
        schemaVersion: 1,
        offer: {
          kind: "delivery-member-owner-terminus",
          workUnitId: "example",
          target: hostedAction.target,
          vehicle: memberVehicle,
          completedPasses: 1,
        },
      },
    });
  });

  it("offers the exact member terminus beside a hosted request after one complete pass", async () => {
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member remains eligible for another hosted pass.",
        nextSource: "coderabbit-pr",
        requestAdmission: readyAdmission("coderabbit-pr"),
        completedPasses: 1,
        attemptHistory: [{
          updatedAt: "2026-09-02T12:00:00.000Z",
          headSha: oid("9"),
          sourceId: "coderabbit-pr",
          outcome: "settled-findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          findingCount: 1,
          settledFindingCount: 1,
        }],
      })],
    });
    const status = await resolveReviewStatus({ target }, port({ routedObligation: obligation }));

    expect(bindDeliveryReviewTerminusOffer(status, {
      workUnitId: "example",
      expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    })).toMatchObject({
      nextAction: "review-hosted-request",
      action: hostedAction,
      terminusAction: {
        schemaVersion: 1,
        offer: {
          kind: "delivery-member-owner-terminus",
          workUnitId: "example",
          target: hostedAction.target,
          vehicle: memberVehicle,
          completedPasses: 1,
        },
      },
    });
  });

  it("offers the exact member terminus beside delegated local preparation after one complete pass", async () => {
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["delegated-agent"],
      maxPasses: 2,
      completedPasses: 1,
      attempts: [],
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member remains eligible for delegated review.",
        nextSource: "delegated-agent",
        requestAdmission: policy,
        completedPasses: 1,
        attemptHistory: [{
          updatedAt: "2026-09-02T12:00:00.000Z",
          headSha: oid("9"),
          sourceId: "coderabbit-pr",
          outcome: "clean",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          findingCount: 0,
          settledFindingCount: 0,
        }],
      })],
    });
    const status = await resolveReviewStatus({ target }, port({ routedObligation: obligation }));

    expect(bindDeliveryReviewTerminusOffer(status, {
      workUnitId: "example",
      expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    })).toMatchObject({
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        target: hostedAction.target,
        vehicle: memberVehicle,
      },
      terminusAction: {
        schemaVersion: 1,
        offer: {
          kind: "delivery-member-owner-terminus",
          target: hostedAction.target,
          vehicle: memberVehicle,
          completedPasses: 1,
        },
      },
    });
  });

  it("does not offer a pre-ceiling terminus from zero-pass or incremental-only progress", async () => {
    const bind = (status: Awaited<ReturnType<typeof resolveReviewStatus>>) => bindDeliveryReviewTerminusOffer(
      status,
      {
        workUnitId: "example",
        expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
        candidateId: `sha256:${"c".repeat(64)}`,
        candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
      },
    );
    const progressCases = [
      conjunctionMemberProgress,
      {
        completedPasses: 1,
        completePasses: 0,
        passCeiling: 2,
        attempts: [{
          updatedAt: "2026-09-02T12:00:00.000Z",
          headSha: memberVehicle.head,
          sourceId: "coderabbit-pr",
          outcome: "clean",
          requestedCoverage: "incremental" as const,
          effectiveCoverage: "incremental" as const,
          findingCount: 0,
          settledFindingCount: 0,
        }],
      },
    ];

    for (const progress of progressCases) {
      const status = await resolveReviewStatus({ target }, port({
        routedObligation: {
          state: "review-required",
          detail: "The first delivery member remains outstanding.",
          conjunction: {
            kind: "delivery",
            status: "outstanding",
            members: [{
              position: 1,
              memberCount: 1,
              chunkKey: memberVehicle.workUnitId,
              title: "Member 1",
              target: hostedAction.target,
              vehicle: memberVehicle,
              state: "outstanding",
              detail: "Hosted review remains required.",
              progress,
            }],
          },
          action: hostedAction,
        },
      }));

      expect(bind(status)).not.toHaveProperty("terminusAction");
      const applicability = reviewApplicabilityDecision(`attempt-${String(progress.completedPasses)}`);
      const applicabilityObligation = composeDeliveryReviewObligation({
        targets: [deliveryTarget(hostedAction.target)],
        discharges: [deliveryDischarge({
          discharged: false,
          detail: "The earlier attempt needs an applicability decision.",
          nextSource: null,
          applicability,
          completedPasses: progress.completedPasses,
          completePasses: progress.completePasses,
          passCeiling: progress.passCeiling,
          attemptHistory: progress.attempts,
        })],
        applicabilityContext: {
          workUnitId: "example",
          expectedRecordVersion: canonicalDigest({ progress }),
          candidateId: canonicalDigest({ candidate: progress }),
        },
      });
      const applicabilityStatus = await resolveReviewStatus({ target }, port({
        routedObligation: applicabilityObligation,
      }));
      expect(applicabilityStatus).toMatchObject({ nextAction: "resolve-review-applicability" });
      expect(bind(applicabilityStatus)).not.toHaveProperty("terminusAction");
    }
  });

  it("keeps pending hosted work and findings ahead of a pre-ceiling terminus offer", async () => {
    const completedProgress = {
      completedPasses: 1,
      completePasses: 1,
      passCeiling: 2,
      attempts: [{
        updatedAt: "2026-09-02T12:00:00.000Z",
        headSha: memberVehicle.head,
        sourceId: "coderabbit-pr",
        outcome: "clean",
        requestedCoverage: "complete" as const,
        effectiveCoverage: "complete" as const,
        findingCount: 0,
        settledFindingCount: 0,
      }],
    };
    const conjunction = {
      kind: "delivery" as const,
      status: "outstanding" as const,
      members: [{
        position: 1,
        memberCount: 1,
        chunkKey: memberVehicle.workUnitId,
        title: "Member 1",
        target: hostedAction.target,
        vehicle: memberVehicle,
        state: "outstanding" as const,
        detail: "The prior attempt remains pending.",
        progress: completedProgress,
      }],
    };
    const statuses = await Promise.all([
      resolveReviewStatus({ target }, port({
        routedObligation: {
          state: "review-required",
          detail: "The hosted request is pending.",
          conjunction,
          awaitAction: hostedAwaitAction,
        },
      })),
      resolveReviewStatus({ target }, port({
        routedObligation: {
          state: "review-required",
          detail: "The earlier findings remain unsettled.",
          conjunction,
          responsePlan: hostedResponsePlan,
        },
      })),
    ]);

    for (const status of statuses) {
      const bound = bindDeliveryReviewTerminusOffer(status, {
        workUnitId: "example",
        expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
        candidateId: `sha256:${"c".repeat(64)}`,
        candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
      });
      expect(bound).not.toHaveProperty("terminusAction");
      expect(() => ReviewStatusResultSchema.parse({
        ...bound,
        terminusAction: {
          schemaVersion: 1,
          kind: "delivery-member-owner-terminus",
          workUnitId: "example",
          expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
          candidateId: `sha256:${"c".repeat(64)}`,
          candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
          target: hostedAction.target,
          vehicle: memberVehicle,
          completedPasses: 1,
          interactionText: "Accept this exact member terminus.",
        },
      })).toThrow();
    }
  });

  it("advances past only the exact Owner-accepted member terminus", () => {
    const secondVehicle = DeliveryReviewMemberVehicleSchema.parse({
      ...memberVehicle,
      deliverableId: `sha256:${"f".repeat(64)}`,
      head: oid("d"),
    });
    const secondTarget = { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 2),
        deliveryTarget(secondTarget, secondVehicle, 2, 2),
      ],
      discharges: [
        deliveryDischarge({
          discharged: false,
          detail: "member one reached its ceiling",
          nextSource: "coderabbit-pr",
          completedPasses: 2,
        }),
        deliveryDischarge({
          discharged: false,
          detail: "member two requires review",
          nextSource: "coderabbit-pr",
          requestAdmission: readyAdmission("coderabbit-pr", secondTarget),
        }),
      ],
      ownerTermini: [{
        vehicle: memberVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 2,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      action: { target: secondTarget, vehicle: secondVehicle },
      conjunction: { members: [{ state: "discharged" }, { state: "outstanding" }] },
    });
  });

  it("keeps pending findings ahead of an exact member terminus", () => {
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The earlier findings attempt remains unsettled.",
        nextSource: null,
        responsePlan: hostedResponsePlan,
      })],
      ownerTermini: [{
        vehicle: memberVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 2,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      responsePlan: hostedResponsePlan,
      conjunction: { members: [{ state: "outstanding" }] },
    });
  });

  it("keeps an exact member terminus across a replayed applicability projection", () => {
    const projection = reviewApplicabilityDecision();
    const secondVehicle = DeliveryReviewMemberVehicleSchema.parse({
      ...memberVehicle,
      deliverableId: `sha256:${"f".repeat(64)}`,
      head: oid("d"),
    });
    const secondTarget = { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 2),
        deliveryTarget(secondTarget, secondVehicle, 2, 2),
      ],
      discharges: [
        deliveryDischarge({
          discharged: false,
          detail: "The prior member review has an uncovered residual.",
          nextSource: null,
          applicability: projection,
        }),
        deliveryDischarge({
          discharged: false,
          detail: "The next member requires review.",
          nextSource: "coderabbit-pr",
          requestAdmission: readyAdmission("coderabbit-pr", secondTarget),
        }),
      ],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 4 }),
        candidateId: canonicalDigest({ candidate: 4 }),
      },
      ownerTermini: [{
        vehicle: memberVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 0,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      action: { target: secondTarget, vehicle: secondVehicle },
      conjunction: { members: [{ state: "discharged" }, { state: "outstanding" }] },
    });
  });

  it("keeps replayed applicability ahead of a terminus with a stale pass count", () => {
    const projection = reviewApplicabilityDecision();
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The prior member review has an uncovered residual.",
        nextSource: null,
        applicability: projection,
      })],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 5 }),
        candidateId: canonicalDigest({ candidate: 5 }),
      },
      ownerTermini: [{
        vehicle: memberVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 1,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      selectionAction: { projection },
      conjunction: { members: [{ state: "outstanding" }] },
    });
  });

  it("keeps conflicting applicability authority ahead of an exact member terminus", () => {
    const projection = reviewApplicabilityDecision();
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "Candidate applicability authority conflicts.",
        nextSource: null,
        applicability: projection,
        applicabilityAuthority: "blocked",
      })],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 6 }),
        candidateId: canonicalDigest({ candidate: 6 }),
      },
      ownerTermini: [{
        vehicle: memberVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 0,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "applicability-conflict",
      applicability: projection,
      conjunction: { members: [{ state: "outstanding" }] },
    });
  });

  it("keeps an active hosted request ahead of a terminus during an applicability replay", () => {
    const projection = reviewApplicabilityDecision();
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The hosted request remains pending while applicability replays.",
        nextSource: null,
        applicability: projection,
        awaitAction: hostedAwaitAction,
      })],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: canonicalDigest({ version: 7 }),
        candidateId: canonicalDigest({ candidate: 7 }),
      },
      ownerTermini: [{
        vehicle: memberVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 0,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      selectionAction: { projection },
      conjunction: { members: [{ state: "outstanding" }] },
    });
  });

  it("does not apply an Owner terminus after the member head moves", () => {
    const priorVehicle = DeliveryReviewMemberVehicleSchema.parse({ ...memberVehicle, head: oid("9") });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The moved member requires review.",
        nextSource: "coderabbit-pr",
        requestAdmission: readyAdmission("coderabbit-pr"),
        completedPasses: 2,
      })],
      ownerTermini: [{
        vehicle: priorVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 2,
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      action: { target: hostedAction.target, vehicle: memberVehicle },
      conjunction: { members: [{ state: "outstanding" }] },
    });
  });

  it("applies a final-member Owner terminus across a proved record-only head advance", () => {
    const priorVehicle = DeliveryReviewMemberVehicleSchema.parse({ ...memberVehicle, head: oid("9") });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The moved member requires review.",
        nextSource: "coderabbit-pr",
        requestAdmission: readyAdmission("coderabbit-pr"),
        completedPasses: 2,
      })],
      ownerTermini: [{
        vehicle: priorVehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 2,
        },
      }],
      ownerTerminusAdvances: [{
        priorVehicle,
        currentVehicle: memberVehicle,
        proof: {
          priorHead: priorVehicle.head,
          priorTree: oid("8"),
          currentHead: memberVehicle.head,
          currentTree: oid("7"),
          proof: "subject-equality",
        },
      }],
    });

    expect(obligation).toMatchObject({
      state: "settled",
      conjunction: { members: [{ state: "discharged" }] },
    });
  });

  it("routes the driver's delegated-agent fallback for the exact outstanding member", async () => {
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["delegated-agent"],
      maxPasses: 2,
      completedPasses: 0,
      attempts: [],
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member requires the delegated-agent fallback.",
        nextSource: "delegated-agent",
        requestAdmission: policy,
      })],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      localAction: {
        schemaVersion: 1,
        sourceId: "delegated-agent",
        target: hostedAction.target,
        vehicle: memberVehicle,
      },
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        statusTarget: target,
        target: hostedAction.target,
        vehicle: memberVehicle,
      },
    });
  });

  it("carries an exact chunked selection into delivery-local admission", async () => {
    const scopeSelection = {
      mode: "chunked" as const,
      target: hostedAction.target,
    };
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      maxPasses: 2,
      completedPasses: 0,
      attempts: [],
      scopeSelection,
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The oversized member requires chunked local review.",
        nextSource: "delegated-agent",
        requestAdmission: policy,
        requestScopeSelection: scopeSelection,
      })],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      localAction: { scopeSelection },
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: { scopeSelection },
    });
  });

  it("admits incremental local review only with an exact correction scope", async () => {
    const scopeSelection = {
      mode: "chunked" as const,
      target: hostedAction.target,
    };
    const ceilingOverride = {
      target: hostedAction.target,
      lane: "standard" as const,
      exhaustedPassCount: 3,
      nextPass: 4,
    };
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "incremental",
        count: 1,
      },
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      maxPasses: 2,
      completedPasses: 3,
      attempts: [],
      scopeSelection,
      ceilingOverride,
    });
    const discharge = deliveryDischarge({
      discharged: false,
      detail: "The oversized member requires chunked local review.",
      nextSource: "delegated-agent",
      completedPasses: 3,
      requestAdmission: policy,
      requestCeilingOverride: ceilingOverride,
      requestScopeSelection: scopeSelection,
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [discharge],
      requestCoverage: "incremental",
    });

    expect(obligation).toMatchObject({
      state: "blocked",
      reason: "coverage-unsupported",
      conjunction: { members: [{ state: "outstanding", progress: { completedPasses: 3 } }] },
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "coverage-unsupported",
      deliveryCursor: { currentMember: { target: hostedAction.target } },
      remedy: {
        argv: [
          "arc", "review", "status", "--work-unit", "example", "--coverage", "complete",
        ],
      },
    });

    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: "hosted/attempt-1",
      predecessorHeadSha: oid("a"),
      basisHeadSha: oid("a"),
      headSha: hostedAction.target.headSha,
      requiredFindings: [{
        producerId: "hosted/attempt-1",
        findingId: "F-material",
        locus: "src/member.ts:1",
      }],
    };
    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [{ ...discharge, correctionScope }],
      requestCoverage: "incremental",
    })).toMatchObject({
      state: "review-required",
      localAction: {
        sourceId: "delegated-agent",
        pass: 4,
        requestedCoverage: "incremental",
        ceilingOverride,
        scopeSelection,
        correctionScope,
      },
    });

    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [{ ...discharge, correctionScope }],
      requestCoverage: "complete",
    })).toMatchObject({
      state: "review-required",
      localAction: {
        sourceId: "delegated-agent",
        pass: 4,
        requestedCoverage: "complete",
      },
    });
    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [{ ...discharge, correctionScope }],
      requestCoverage: "complete",
    })).not.toHaveProperty("localAction.correctionScope");
  });

  it("requires an exact scope before dispatching native CodeRabbit correction coverage", async () => {
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: "hosted/attempt-1",
      predecessorHeadSha: oid("a"),
      basisHeadSha: oid("a"),
      headSha: hostedAction.target.headSha,
      requiredFindings: [],
    };
    const coderabbit = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member requires correction review.",
        nextSource: "coderabbit-pr",
        requestCoverage: "incremental",
        requestAdmission: readyAdmission("coderabbit-pr"),
      })],
      requestCoverage: "incremental",
    });

    expect(coderabbit).toMatchObject({
      state: "blocked",
      reason: "coverage-unsupported",
      conjunction: { members: [{ state: "outstanding" }] },
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: coderabbit }))).resolves.toMatchObject({
      state: "blocked",
      reason: "coverage-unsupported",
      remedy: {
        invariant: "The selected review carrier cannot preserve the admitted correction scope.",
        text: expect.stringContaining("Re-run with complete coverage"),
        argv: [
          "arc", "review", "status", "--work-unit", "example",
          "--coverage", "complete",
        ],
      },
    });

    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member requires correction review.",
        nextSource: "coderabbit-pr",
        requestCoverage: "incremental",
        correctionScope,
        requestAdmission: readyAdmission("coderabbit-pr"),
      })],
      requestCoverage: "incremental",
    })).toMatchObject({
      state: "review-required",
      action: {
        provider: "coderabbit-pr",
        coverage: "incremental",
        correctionScope,
      },
    });

    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The member requires correction review.",
        nextSource: "codex-pr",
        requestCoverage: "incremental",
        correctionScope,
        requestAdmission: readyAdmission("codex-pr"),
      })],
      requestCoverage: "incremental",
    })).toMatchObject({
      state: "review-required",
      action: { provider: "codex-pr", coverage: "incremental", correctionScope },
    });
  });

  it("preserves typed coverage selection through public delivery status", async () => {
    const coverageSelectionAction = {
      schemaVersion: 1 as const,
      kind: "review-coverage-selection" as const,
      workUnitId: memberVehicle.workUnitId,
      sourceId: "coderabbit-pr",
      pass: 1,
      completedPasses: 1,
      consumedPass: true as const,
      choices: [{ sourceId: "coderabbit-pr", coverage: "complete" as const }],
      interactionText: "Select complete coverage for the next member pass.",
    };
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The terminal result requires adequate coverage.",
        nextSource: null,
        coverageSelectionAction,
        completedPasses: 1,
        attemptHistory: [{
          updatedAt: "2026-09-04T12:00:00.000Z",
          headSha: hostedAction.target.headSha,
          sourceId: "coderabbit-pr",
          outcome: "clean",
          requestedCoverage: "incremental",
          effectiveCoverage: "incremental",
          findingCount: 0,
          settledFindingCount: 0,
        }],
      })],
    });

    expect(obligation).toMatchObject({
      state: "coverage-required",
      coverageSelectionAction,
      conjunction: {
        members: [{ progress: { completedPasses: 1, passCeiling: 2 } }],
      },
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "coverage-required",
      nextAction: "select-coverage",
      coverageSelectionAction,
      deliveryCursor: {
        currentMember: { progress: { completedPasses: 1, passCeiling: 2 } },
      },
    });
  });

  it("consumes an exact coverage choice into the next admitted request", () => {
    const coverageSelectionAction = {
      schemaVersion: 1 as const,
      kind: "review-coverage-selection" as const,
      workUnitId: memberVehicle.workUnitId,
      sourceId: "coderabbit-pr",
      pass: 1,
      completedPasses: 1,
      consumedPass: true as const,
      choices: [{ sourceId: "coderabbit-pr", coverage: "complete" as const }],
      interactionText: "Select complete coverage for the next member pass.",
    };

    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The next complete pass is admitted.",
        nextSource: "coderabbit-pr",
        coverageSelectionAction,
        requestAdmission: readyAdmission("coderabbit-pr"),
      })],
      requestCoverage: "complete",
      requestInvocation: { mode: "force", sourceId: "coderabbit-pr" },
    })).toMatchObject({
      state: "review-required",
      action: {
        provider: "coderabbit-pr",
        coverage: "complete",
        invocation: { mode: "force", sourceId: "coderabbit-pr" },
      },
    });
  });

  it("refuses a chunked selection whose exact member target has moved", () => {
    const movedVehicle = DeliveryReviewMemberVehicleSchema.parse({
      ...memberVehicle,
      head: oid("d"),
    });
    assertSchemaRefuses(DeliveryLocalReviewSelectionSchema, {
      schemaVersion: 1,
      sourceId: "delegated-agent",
      target: { ...hostedAction.target, headSha: movedVehicle.head },
      vehicle: movedVehicle,
      pass: 1,
      requestedCoverage: "complete",
      scopeSelection: {
        mode: "chunked",
        target: hostedAction.target,
      },
    });
  });

  it("refuses a local correction scope that does not end at the selected member", () => {
    assertSchemaRefuses(DeliveryLocalReviewSelectionSchema, {
      schemaVersion: 1,
      sourceId: "delegated-agent",
      target: hostedAction.target,
      vehicle: memberVehicle,
      pass: 2,
      requestedCoverage: "incremental",
      correctionScope: {
        schemaVersion: 1,
        predecessorProducerId: "hosted/attempt-1",
        predecessorHeadSha: oid("a"),
        basisHeadSha: oid("a"),
        headSha: oid("d"),
        requiredFindings: [],
      },
    });
  });

  it("requires local coverage to agree with correction-scope presence", () => {
    const selection = {
      schemaVersion: 1 as const,
      sourceId: "delegated-agent" as const,
      target: hostedAction.target,
      vehicle: memberVehicle,
      pass: 2,
    };
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: "hosted/attempt-1",
      predecessorHeadSha: oid("a"),
      basisHeadSha: oid("a"),
      headSha: hostedAction.target.headSha,
      requiredFindings: [],
    };

    assertSchemaRefuses(DeliveryLocalReviewSelectionSchema, selection);
    assertSchemaAccepts(DeliveryLocalReviewSelectionSchema, {
      ...selection,
      requestedCoverage: "complete",
    });
    assertSchemaRefuses(DeliveryLocalReviewSelectionSchema, {
      ...selection,
      requestedCoverage: "complete",
      correctionScope,
    });
    assertSchemaRefuses(DeliveryLocalReviewSelectionSchema, {
      ...selection,
      requestedCoverage: "incremental",
    });
    assertSchemaAccepts(DeliveryLocalReviewSelectionSchema, {
      ...selection,
      requestedCoverage: "incremental",
      correctionScope,
    });
  });

  it("returns the exact delegated findings operation for local review resumption", async () => {
    const localResumeAction = { schemaVersion: 1 as const, operationId: "local-review-prior" };
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The delegated findings attempt remains unsettled.",
        nextSource: null,
        localResumeAction,
      })],
    });

    expect(obligation).toMatchObject({ state: "review-required", localResumeAction });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-local-resume",
      action: localResumeAction,
    });
  });

  it("carries an exact one-pass ceiling override into the admitted hosted request", () => {
    const ceilingOverride = {
      target: hostedAction.target,
      lane: "standard" as const,
      exhaustedPassCount: 2,
      nextPass: 3,
    };
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["coderabbit-pr", "codex-pr"],
      maxPasses: 2,
      completedPasses: 2,
      attempts: [],
      ceilingOverride,
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "One additional member review pass was approved.",
        nextSource: "coderabbit-pr",
        requestAdmission: policy,
        requestCeilingOverride: ceilingOverride,
      })],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      action: {
        ...hostedAction,
        ceilingOverride,
      },
    });
  });

  it("carries an exact one-pass ceiling override into delegated local admission", async () => {
    const ceilingOverride = {
      target: hostedAction.target,
      lane: "standard" as const,
      exhaustedPassCount: 2,
      nextPass: 3,
    };
    const policy = resolveReviewPolicy({
      schemaVersion: 1,
      target: hostedAction.target,
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      sources: ["delegated-agent"],
      maxPasses: 2,
      completedPasses: 2,
      attempts: [],
      ceilingOverride,
    });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "One additional delegated member review pass was approved.",
        nextSource: "delegated-agent",
        requestAdmission: policy,
        requestCeilingOverride: ceilingOverride,
      })],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      localAction: {
        sourceId: "delegated-agent",
        target: hostedAction.target,
        vehicle: memberVehicle,
        pass: 3,
        ceilingOverride,
      },
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        statusTarget: target,
        target: hostedAction.target,
        vehicle: memberVehicle,
        pass: 3,
        ceilingOverride,
      },
    });
  });

  it("returns one status-owned Candidate selection offer before another hosted pass is spent", async () => {
    const projection = reviewApplicabilityDecision();
    const expectedRecordVersion = canonicalDigest({ version: 2 });
    const candidateId = canonicalDigest({ candidate: 2 });
    const completedPass = {
      updatedAt: "2026-09-04T12:00:00.000Z",
      headSha: projection.selector.priorHead,
      sourceId: "coderabbit-pr",
      outcome: "settled-findings" as const,
      requestedCoverage: "complete" as const,
      effectiveCoverage: "complete" as const,
      findingCount: 1,
      settledFindingCount: 1,
    };
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "The prior member review has an uncovered residual.",
        nextSource: null,
        applicability: projection,
        completedPasses: 1,
        attemptHistory: [completedPass],
      })],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion,
        candidateId,
      },
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      selectionAction: {
        kind: "review-applicability-selection",
        workUnitId: "example",
        expectedRecordVersion,
        candidateId,
        projection,
        choices: ["covered", "review-required"],
      },
    });
    if (!("selectionAction" in obligation)) throw new Error("expected applicability selection action");
    const status = await resolveReviewStatus({ target }, port({ routedObligation: obligation }));
    expect(status).toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
      selectionAction: obligation.selectionAction,
    });
    expect(bindDeliveryReviewTerminusOffer(status, {
      workUnitId: "example",
      expectedBoundaryVersion: `sha256:${"b".repeat(64)}`,
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    })).toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
      selectionAction: obligation.selectionAction,
      terminusAction: {
        schemaVersion: 1,
        offer: {
          kind: "delivery-member-owner-terminus",
          target: hostedAction.target,
          vehicle: memberVehicle,
          completedPasses: 1,
        },
      },
    });
  });

  it("returns one batch offer for equivalent retained applicability attempts", async () => {
    const first = reviewApplicabilityDecision("attempt-first");
    const second = reviewApplicabilityDecision("attempt-second");
    const expectedRecordVersion = canonicalDigest({ version: 3 });
    const candidateId = canonicalDigest({ candidate: 3 });
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "Two retained attempts share one exact residual judgment.",
        nextSource: null,
        applicability: first,
        equivalentApplicabilities: [first, second],
      })],
      applicabilityContext: { workUnitId: "example", expectedRecordVersion, candidateId },
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      selectionAction: {
        kind: "review-applicability-selection-batch",
        workUnitId: "example",
        expectedRecordVersion,
        candidateId,
        projections: [first, second],
        choices: ["covered", "review-required"],
      },
    });
    if (!("selectionAction" in obligation)) throw new Error("expected batch applicability selection action");
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
      selectionAction: obligation.selectionAction,
    });
  });

  it("preserves a conflicting Candidate selection as a typed applicability stop", async () => {
    const applicability = reviewApplicabilityDecision();
    const obligation = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({
        discharged: false,
        detail: "Conflicting Candidate applicability selections require correction.",
        nextSource: null,
        applicability,
        applicabilityAuthority: "blocked",
      })],
    });

    expect(obligation).toMatchObject({
      state: "applicability-conflict",
      applicability,
    });
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "applicability-selection-conflict",
      applicability,
    });
  });

  it.each([
    ["rerun", "applicability-rerun", "rerun-checkpoint", undefined],
    ["failed", "blocked", "stop", "applicability-failed"],
    ["unsupported", "applicability-unsupported", "upgrade", undefined],
    ["unavailable", "blocked", "stop", "applicability-unavailable"],
  ] as const)(
    "preserves the %s applicability stop class through review status",
    async (kind, state, nextAction, reason) => {
      const applicability = blockedApplicability(kind);
      const obligation = composeDeliveryReviewObligation({
        targets: [deliveryTarget(hostedAction.target)],
        discharges: [deliveryDischarge({
          discharged: false,
          detail: `Applicability ${kind}.`,
          nextSource: null,
          applicability,
        })],
      });

      expect(obligation).toMatchObject({
        state: "applicability-blocked",
        applicability,
      });
      await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
        state,
        nextAction,
        applicability,
        ...(reason === undefined ? {} : { reason }),
      });
    },
  );

  it("selects the first outstanding retained delivery member in plan order", () => {
    const secondVehicle = {
      ...memberVehicle,
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"d".repeat(64)}`),
      head: oid("d"),
    };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 2),
        deliveryTarget({
          repository: "owner/repo",
          pullRequest: 42,
          headSha: secondVehicle.head,
        }, secondVehicle, 2, 2),
      ],
      discharges: [
        deliveryDischarge({
          discharged: false,
          detail: "member one outstanding",
          nextSource: "coderabbit-pr",
          requestAdmission: readyAdmission("coderabbit-pr"),
        }),
        deliveryDischarge({
          discharged: false,
          detail: "member two outstanding",
          nextSource: "coderabbit-pr",
        }),
      ],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      conjunction: {
        status: "outstanding",
        members: [
          { vehicle: memberVehicle, state: "outstanding" },
          { vehicle: secondVehicle, state: "outstanding" },
        ],
      },
      action: { target: hostedAction.target, provider: "coderabbit-pr", vehicle: memberVehicle },
    });
  });

  it("advances to the next retained member after the first member settles", () => {
    const secondVehicle = {
      ...memberVehicle,
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"d".repeat(64)}`),
      head: oid("d"),
    };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 2),
        deliveryTarget(
          { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head },
          secondVehicle,
          2,
          2,
        ),
      ],
      discharges: [
        deliveryDischarge({ discharged: true, detail: "member one discharged", nextSource: null }),
        deliveryDischarge({
          discharged: false,
          detail: "member two outstanding",
          nextSource: "codex-pr",
          requestAdmission: readyAdmission("codex-pr", {
            repository: "owner/repo",
            pullRequest: 42,
            headSha: secondVehicle.head,
          }),
        }),
      ],
    });

    expect(obligation).toMatchObject({
      state: "review-required",
      conjunction: {
        members: [{ state: "discharged" }, { state: "outstanding" }],
      },
      action: {
        target: { pullRequest: 42, headSha: secondVehicle.head },
        provider: "codex-pr",
        vehicle: secondVehicle,
      },
    });
  });

  it("routes a discharged selected member to landing while later review remains outstanding", async () => {
    const secondVehicle = {
      ...memberVehicle,
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"d".repeat(64)}`),
      head: oid("d"),
    };
    const secondHostedTarget = { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 2),
        deliveryTarget(secondHostedTarget, secondVehicle, 2, 2),
      ],
      discharges: [
        deliveryDischarge({ discharged: true, detail: "member one discharged", nextSource: null }),
        deliveryDischarge({
          discharged: false,
          detail: "member two outstanding",
          nextSource: "codex-pr",
          requestAdmission: readyAdmission("codex-pr", secondHostedTarget),
        }),
      ],
    });
    const selectedTarget = { ...target, headSha: memberVehicle.head };
    const laterTarget = { ...target, headRef: "delivery/member-2", headSha: secondVehicle.head };

    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      routedObligation: obligation,
    }))).resolves.toMatchObject({
      state: "member-discharged",
      nextAction: "continue-reconcile",
      selectedMember: { vehicle: memberVehicle, state: "discharged" },
      routedObligation: {
        state: "review-required",
        conjunction: { status: "outstanding" },
      },
    });
    await expect(resolveReviewStatus({ target: laterTarget }, port({
      actualHeadSha: laterTarget.headSha,
      routedObligation: obligation,
    }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: { target: secondHostedTarget },
    });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "member-discharged", nextAction: "continue-reconcile" });
    await expect(resolveReviewStatus({ target: laterTarget }, port({
      actualHeadSha: laterTarget.headSha,
      baseContained: false,
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "review-required", nextAction: "review-hosted-request" });
    await expect(resolveReviewStatus({ target: laterTarget }, port({
      actualHeadSha: laterTarget.headSha,
      baseContained: false,
      baseMovement: {
        coordinates: {
          repository: laterTarget.repository,
          changeRequest: 42,
          base: oid("b"),
          head: laterTarget.headSha,
        },
        overlap: { status: "available", substantivePaths: ["src/shared.ts"], regenerablePaths: [] },
      },
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "base-moved", nextAction: "rerun-checkpoint" });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement: {
        coordinates: {
          repository: selectedTarget.repository,
          changeRequest: 41,
          base: oid("b"),
          head: selectedTarget.headSha,
        },
        overlap: { status: "available", substantivePaths: ["src/shared.ts"], regenerablePaths: [] },
      },
      routedObligation: obligation,
    }))).resolves.toMatchObject({
      state: "member-discharged",
      nextAction: "continue-reconcile",
      movement: "overlapping",
      selectedMember: { vehicle: memberVehicle, state: "discharged" },
    });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      requiredChecks: "pending",
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "checks-pending", nextAction: "rerun-checkpoint" });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      requiredChecks: "failed",
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "blocked", reason: "checks-failed" });
  });

  it("continues exact pre-terminal member review while protected-base movement overlaps", async () => {
    const secondVehicle = {
      ...memberVehicle,
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"d".repeat(64)}`),
      head: oid("d"),
    };
    const thirdVehicle = {
      ...memberVehicle,
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"e".repeat(64)}`),
      head: oid("e"),
    };
    const secondHostedTarget = { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head };
    const thirdHostedTarget = { repository: "owner/repo", pullRequest: 43, headSha: thirdVehicle.head };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 3),
        deliveryTarget(secondHostedTarget, secondVehicle, 2, 3),
        deliveryTarget(thirdHostedTarget, thirdVehicle, 3, 3),
      ],
      discharges: [
        deliveryDischarge({ discharged: true, detail: "member one discharged", nextSource: null }),
        deliveryDischarge({
          discharged: false,
          detail: "member two outstanding",
          nextSource: "codex-pr",
          requestAdmission: readyAdmission("codex-pr", secondHostedTarget),
        }),
        deliveryDischarge({ discharged: false, detail: "member three outstanding", nextSource: "codex-pr" }),
      ],
    });
    const selectedTarget = { ...target, headRef: "delivery/member-2", headSha: secondVehicle.head };
    const baseMovement = {
      coordinates: {
        repository: selectedTarget.repository,
        changeRequest: 42,
        base: oid("b"),
        head: selectedTarget.headSha,
      },
      overlap: { status: "available" as const, substantivePaths: ["src/shared.ts"], regenerablePaths: [] },
    };

    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement,
      routedObligation: obligation,
    }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      movement: "overlapping",
      baseMovement,
      action: { target: secondHostedTarget },
    });
    const earlierOutstanding = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 3),
        deliveryTarget(secondHostedTarget, secondVehicle, 2, 3),
        deliveryTarget(thirdHostedTarget, thirdVehicle, 3, 3),
      ],
      discharges: [
        deliveryDischarge({ discharged: false, detail: "member one outstanding", nextSource: "codex-pr",
          requestAdmission: readyAdmission("codex-pr", hostedAction.target) }),
        deliveryDischarge({ discharged: false, detail: "member two outstanding", nextSource: "codex-pr" }),
        deliveryDischarge({ discharged: false, detail: "member three outstanding", nextSource: "codex-pr" }),
      ],
    });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement,
      routedObligation: earlierOutstanding,
    }))).resolves.toMatchObject({ state: "base-moved", nextAction: "rerun-checkpoint" });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement: {
        ...baseMovement,
        overlap: { status: "unavailable", reason: "classification-failed" },
      },
      routedObligation: obligation,
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      movement: "unknown",
    });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement: {
        ...baseMovement,
        coordinates: { ...baseMovement.coordinates, changeRequest: 43 },
      },
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "blocked", nextAction: "stop", reason: "status-unavailable" });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement: {
        ...baseMovement,
        coordinates: { ...baseMovement.coordinates, base: oid("c") },
      },
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "blocked", nextAction: "stop", reason: "status-unavailable" });
    if (!("conjunction" in obligation)) throw new Error("expected delivery conjunction");
    const firstMember = obligation.conjunction.members[0];
    if (firstMember === undefined) throw new Error("expected first member");
    const ambiguousObligation = RoutedReviewObligationSchema.parse({
      ...obligation,
      conjunction: {
        ...obligation.conjunction,
        members: [{
          ...firstMember,
          target: { ...firstMember.target, headSha: secondVehicle.head },
          vehicle: { ...firstMember.vehicle, head: secondVehicle.head },
        }, ...obligation.conjunction.members.slice(1)],
      },
    });
    await expect(resolveReviewStatus({ target: selectedTarget }, port({
      actualHeadSha: selectedTarget.headSha,
      baseContained: false,
      baseMovement,
      routedObligation: ambiguousObligation,
    }))).resolves.toMatchObject({ state: "base-moved", nextAction: "rerun-checkpoint" });
    const terminalTarget = { ...target, headSha: thirdVehicle.head };
    await expect(resolveReviewStatus({ target: terminalTarget }, port({
      actualHeadSha: terminalTarget.headSha,
      baseContained: false,
      baseMovement: {
        ...baseMovement,
        coordinates: { ...baseMovement.coordinates, changeRequest: 43, head: terminalTarget.headSha },
      },
      routedObligation: obligation,
    }))).resolves.toMatchObject({ state: "base-moved", nextAction: "rerun-checkpoint" });
  });

  it("reports a discharged typed conjunction only after every retained member settles", () => {
    const secondVehicle = {
      ...memberVehicle,
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"d".repeat(64)}`),
      head: oid("d"),
    };
    const obligation = composeDeliveryReviewObligation({
      targets: [
        deliveryTarget(hostedAction.target, memberVehicle, 1, 2),
        deliveryTarget(
          { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head },
          secondVehicle,
          2,
          2,
        ),
      ],
      discharges: [
        deliveryDischarge({ discharged: true, detail: "member one discharged", nextSource: null }),
        deliveryDischarge({ discharged: true, detail: "member two discharged", nextSource: null }),
      ],
    });

    expect(obligation).toMatchObject({
      state: "settled",
      conjunction: {
        kind: "delivery",
        status: "discharged",
        members: [{ state: "discharged" }, { state: "discharged" }],
      },
    });
    expect(obligation).not.toHaveProperty("action");
  });

  it("exposes the discharged conjunction on terminal review status", async () => {
    const conjunction = composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [deliveryDischarge({ discharged: true, detail: "member discharged", nextSource: null })],
    });

    await expect(resolveReviewStatus({ target }, port({ routedObligation: conjunction }))).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      routedObligation: {
        state: "settled",
        conjunction: {
          kind: "delivery",
          status: "discharged",
          members: [{ vehicle: memberVehicle, state: "discharged" }],
        },
      },
    });
  });

  it("routes pending required checks back through the checkpoint rather than waiting here", async () => {
    await expect(resolveReviewStatus({ target }, port({ requiredChecks: "pending" }))).resolves.toMatchObject({
      state: "checks-pending",
      nextAction: "rerun-checkpoint",
      requiredChecks: "pending",
    });
  });

  it("continues only when the exact target conjunction is settled", async () => {
    await expect(resolveReviewStatus({ target }, port())).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      requiredChecks: "green",
      routedObligation: { state: "settled" },
      currentBaseOid: oid("b"),
    });
  });

  it("stops when the routed obligation cannot be established", async () => {
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: { state: "blocked", detail: "The publication boundary is unavailable." },
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target)] },
    });
  });

  it("stops on failed required checks", async () => {
    await expect(resolveReviewStatus({ target }, port({ requiredChecks: "failed" }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "checks-failed",
      requiredChecks: "failed",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target)] },
    });
  });
});

/**
 * The hold at the review-status reduction, on the vehicle every existing check skips.
 *
 * A pre-terminal delivery member is answered by a guard that requires an available overlap. An ambiguous or an
 * unrelated base is exactly the pair that has none, so the guard fired first and returned a rerun of the read
 * that produced the condition — the one remedy neither cause can clear.
 */
describe("review status over a pre-terminal delivery member whose base will not resolve", () => {
  /** The exact member the status target names, held short of the terminal so the guard is the one in play. */
  function preTerminalConjunction() {
    return {
      kind: "delivery" as const,
      status: "outstanding" as const,
      members: [
        {
          position: 1,
          memberCount: 2,
          chunkKey: "member-1",
          title: "Member 1",
          target: { repository: target.repository, pullRequest: 41, headSha: target.headSha },
          vehicle: { ...memberVehicle, head: target.headSha },
          state: "discharged" as const,
          detail: "The member review is discharged.",
          progress: conjunctionMemberProgress,
        },
        {
          position: 2,
          memberCount: 2,
          chunkKey: "member-2",
          title: "Member 2",
          target: { repository: target.repository, pullRequest: 42, headSha: oid("e") },
          vehicle: { ...memberVehicle, deliverableId: CanonicalDigestSchema.parse(`sha256:${"e".repeat(64)}`), head: oid("e") },
          state: "outstanding" as const,
          detail: "The member review is pending.",
          progress: conjunctionMemberProgress,
        },
      ],
    };
  }

  const secondVehicle = { ...memberVehicle, deliverableId: CanonicalDigestSchema.parse(`sha256:${"e".repeat(64)}`), head: oid("e") };
  const secondTarget = { repository: target.repository, pullRequest: 42, headSha: oid("e") };
  const pendingSecondMember = {
    state: "review-required" as const,
    detail: "The member review is pending.",
    conjunction: preTerminalConjunction(),
    awaitAction: {
      ...hostedAwaitAction,
      handle: createHostedHandleFixture({
        provider: hostedAction.provider,
        requestedCoverage: hostedAction.coverage,
        effectiveCoverage: hostedAction.coverage,
        target: secondTarget,
        artifact: {
          kind: "issue-comment",
          id: "request-42",
          url: "https://example.test/request-42",
          createdAt: "2026-09-01T12:00:00.000Z",
        },
        vehicle: secondVehicle,
      }),
    },
  };

  const unresolvableBase = (overlap: { status: "ambiguous" } | { status: "unrelated" }) => port({
    baseContained: false,
    routedObligation: pendingSecondMember,
    baseMovement: {
      coordinates: {
        repository: target.repository,
        changeRequest: 41,
        base: oid("b"),
        head: target.headSha,
      },
      overlap,
    },
  });

  it("states an unrelated base as terminal rather than as unavailable member movement", async () => {
    const status = await resolveReviewStatus({ target }, unresolvableBase({ status: "unrelated" }));

    // No member-binding read changes whether the pair shares an ancestor, so the fact about the pair is
    // answered before the guard that cannot bind it.
    expect(status).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "base-unrelated",
      baseMovementCause: "unrelated",
    });
    expect(status).not.toMatchObject({ reason: "status-unavailable" });
  });

  it("sends an ambiguous base to the checkpoint rather than to a rerun of this read", async () => {
    const status = await resolveReviewStatus({ target }, unresolvableBase({ status: "ambiguous" }));

    expect(status).toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      baseMovementCause: "ambiguous",
    });
  });

  it("still reports unavailable member movement when the base resolved and the member did not bind", async () => {
    const status = await resolveReviewStatus({ target }, port({
      baseContained: false,
      routedObligation: pendingSecondMember,
      baseMovement: {
        coordinates: {
          repository: target.repository,
          changeRequest: 99,
          base: oid("b"),
          head: target.headSha,
        },
        overlap: { status: "available", substantivePaths: ["src/example.ts"], regenerablePaths: [] },
      },
    }));

    expect(status).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail: "Pre-terminal delivery-member base movement is unavailable for the exact selected request.",
    });
  });
});

/** Exact-target review status reduction. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { createReviewTarget } from
  "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { classifyReviewContributionApplicability } from
  "../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import { DeliveryLocalReviewSelectionSchema } from
  "../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { resolveReviewPolicy } from
  "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import {
  bindDeliveryReviewTerminusOffer,
  composeDeliveryReviewObligation,
  composeSingletonReviewObligation,
  ReviewStatusResultSchema,
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
  handle: {
    schemaVersion: 1 as const,
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
  },
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
  input: Omit<DeliveryDischargeInput, "completedPasses" | "passCeiling" | "attemptHistory">
    & Partial<Pick<DeliveryDischargeInput, "completedPasses" | "passCeiling" | "attemptHistory">>,
): DeliveryDischargeInput {
  return {
    completedPasses: 0,
    passCeiling: 2,
    attemptHistory: [],
    ...input,
  };
}

const conjunctionMemberProgress = {
  completedPasses: 0,
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
  }],
};

function readyAdmission(
  sourceId: "coderabbit-pr" | "codex-pr",
  admissionTarget = hostedAction.target,
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
    completedPasses: 0,
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
      ...overrides,
    }),
  };
}

describe("review status", () => {
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
          "--json",
        ],
      },
    });
  });

  it("routes a newly advanced base back through the checkpoint", async () => {
    await expect(resolveReviewStatus({ target }, port({ baseContained: false }))).resolves.toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      currentBaseOid: oid("b"),
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

    expect(RoutedReviewObligationSchema.safeParse(withoutConjunction).success).toBe(false);
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
        kind: "delivery-member-owner-terminus",
        workUnitId: "example",
        remote: "upstream",
        target: hostedAction.target,
        vehicle: memberVehicle,
        completedPasses: 2,
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
        kind: "delivery-member-owner-terminus",
        workUnitId: "example",
        target: hostedAction.target,
        vehicle: memberVehicle,
        completedPasses: 1,
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
        kind: "delivery-member-owner-terminus",
        target: hostedAction.target,
        vehicle: memberVehicle,
        completedPasses: 1,
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
    }
  });

  it("keeps pending hosted work and findings ahead of a pre-ceiling terminus offer", async () => {
    const completedProgress = {
      completedPasses: 1,
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

  it("refuses to broaden explicit incremental coverage through the complete-only local carrier", async () => {
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
        retrigger: "full-final",
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
          "arc", "review", "status", "--work-unit", "example", "--coverage", "incremental", "--json",
        ],
      },
    });

    expect(composeDeliveryReviewObligation({
      targets: [deliveryTarget(hostedAction.target)],
      discharges: [discharge],
    })).toMatchObject({
      state: "review-required",
      localAction: {
        sourceId: "delegated-agent",
        pass: 4,
        ceilingOverride,
        scopeSelection,
      },
    });
  });

  it("refuses a chunked selection whose exact member target has moved", () => {
    const movedVehicle = DeliveryReviewMemberVehicleSchema.parse({
      ...memberVehicle,
      head: oid("d"),
    });
    const result = DeliveryLocalReviewSelectionSchema.safeParse({
      schemaVersion: 1,
      sourceId: "delegated-agent",
      target: { ...hostedAction.target, headSha: movedVehicle.head },
      vehicle: movedVehicle,
      pass: 1,
      scopeSelection: {
        mode: "chunked",
        target: hostedAction.target,
      },
    });

    expect(result.success).toBe(false);
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
    await expect(resolveReviewStatus({ target }, port({ routedObligation: obligation }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
      selectionAction: obligation.selectionAction,
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
      deliverableId: `sha256:${"d".repeat(64)}`,
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
      deliverableId: `sha256:${"d".repeat(64)}`,
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

  it("reports a discharged typed conjunction only after every retained member settles", () => {
    const secondVehicle = {
      ...memberVehicle,
      deliverableId: `sha256:${"d".repeat(64)}`,
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
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target), "--json"] },
    });
  });

  it("stops on failed required checks", async () => {
    await expect(resolveReviewStatus({ target }, port({ requiredChecks: "failed" }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "checks-failed",
      requiredChecks: "failed",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target), "--json"] },
    });
  });
});

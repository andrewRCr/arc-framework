/** Exact-target review status reduction. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { createReviewTarget } from
  "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { classifyReviewContributionApplicability } from
  "../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import { resolveReviewPolicy } from
  "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import {
  composeDeliveryReviewObligation,
  composeSingletonReviewObligation,
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

function reviewApplicabilityDecision() {
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
    priorAttemptId: "attempt-prior",
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "The prior member review has an uncovered residual.",
        nextSource: null,
        applicability: projection,
      }],
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
            target: hostedAction.target,
            vehicle: memberVehicle,
            state: "outstanding",
            detail: "Hosted review remains required.",
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
    });
  });

  it("returns the exact retained findings response before another hosted request", async () => {
    const obligation = composeDeliveryReviewObligation({
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "The earlier findings attempt remains unsettled.",
        nextSource: null,
        responsePlan: hostedResponsePlan,
      }],
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "The member has exhausted its configured review passes.",
        nextSource: "coderabbit-pr",
        requestAdmission: policy,
      }],
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "The member requires the delegated-agent fallback.",
        nextSource: "delegated-agent",
        requestAdmission: policy,
      }],
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

  it("returns the exact delegated findings operation for local review resumption", async () => {
    const localResumeAction = { schemaVersion: 1 as const, operationId: "local-review-prior" };
    const obligation = composeDeliveryReviewObligation({
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "The delegated findings attempt remains unsettled.",
        nextSource: null,
        localResumeAction,
      }],
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "One additional member review pass was approved.",
        nextSource: "coderabbit-pr",
        requestAdmission: policy,
        requestCeilingOverride: ceilingOverride,
      }],
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "One additional delegated member review pass was approved.",
        nextSource: "delegated-agent",
        requestAdmission: policy,
        requestCeilingOverride: ceilingOverride,
      }],
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "The prior member review has an uncovered residual.",
        nextSource: null,
        applicability: projection,
      }],
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

  it("preserves a conflicting Candidate selection as a typed applicability stop", async () => {
    const applicability = reviewApplicabilityDecision();
    const obligation = composeDeliveryReviewObligation({
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{
        discharged: false,
        detail: "Conflicting Candidate applicability selections require correction.",
        nextSource: null,
        applicability,
        applicabilityAuthority: "blocked",
      }],
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
        targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
        discharges: [{
          discharged: false,
          detail: `Applicability ${kind}.`,
          nextSource: null,
          applicability,
        }],
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
        { ...hostedAction.target, vehicle: memberVehicle },
        {
          repository: "owner/repo",
          pullRequest: 42,
          headSha: secondVehicle.head,
          vehicle: secondVehicle,
        },
      ],
      discharges: [
        {
          discharged: false,
          detail: "member one outstanding",
          nextSource: "coderabbit-pr",
          requestAdmission: readyAdmission("coderabbit-pr"),
        },
        { discharged: false, detail: "member two outstanding", nextSource: "coderabbit-pr" },
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
        { ...hostedAction.target, vehicle: memberVehicle },
        { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head, vehicle: secondVehicle },
      ],
      discharges: [
        { discharged: true, detail: "member one discharged", nextSource: null },
        {
          discharged: false,
          detail: "member two outstanding",
          nextSource: "codex-pr",
          requestAdmission: readyAdmission("codex-pr", {
            repository: "owner/repo",
            pullRequest: 42,
            headSha: secondVehicle.head,
          }),
        },
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
        { ...hostedAction.target, vehicle: memberVehicle },
        { repository: "owner/repo", pullRequest: 42, headSha: secondVehicle.head, vehicle: secondVehicle },
      ],
      discharges: [
        { discharged: true, detail: "member one discharged", nextSource: null },
        { discharged: true, detail: "member two discharged", nextSource: null },
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
      targets: [{ ...hostedAction.target, vehicle: memberVehicle }],
      discharges: [{ discharged: true, detail: "member discharged", nextSource: null }],
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

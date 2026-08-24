/** Exact-target review status reduction. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { classifyReviewContributionApplicability } from
  "../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import {
  composeDeliveryReviewObligation,
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
        { discharged: false, detail: "member one outstanding", nextSource: "coderabbit-pr" },
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
        { discharged: false, detail: "member two outstanding", nextSource: "codex-pr" },
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

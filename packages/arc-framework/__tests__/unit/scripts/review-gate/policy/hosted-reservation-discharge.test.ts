/** Unit coverage for hosted-review reservation discharge. */

import { describe, expect, it } from "vitest";

import { createHostedTerminalAttemptFixture } from "../../../../fixtures/hosted-review.js";

import type { DeliveryHostPort } from
  "../../../../../src/lib/delivery/host.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import type { GitExec } from "../../../../../src/lib/git/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { resolveReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { classifyReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import {
  allHostedReservationTargetsDischarged,
  confirmIncrementalPredecessorApplicability,
  createHostedReservationDischargeReader,
  incrementalApplicabilityFromEarlierRead,
  projectHostedReservationDischarge as projectHostedReservationDischargeRaw,
  resolveHostedReservationTargets,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { buildIncrementalCorrectionScope } from
  "../../../../../src/scripts/review-gate/policy/incremental-coverage-basis.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import type { HostedCoverageEvidence } from
  "../../../../../src/scripts/review-gate/hosted/await.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createHostedAdmission } from
  "../../../../../src/scripts/review-gate/hosted/request.js";

const oid = (character: string): string => character.repeat(40);
const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const MEMBER_ONE = `sha256:${"3".repeat(64)}`;
const MEMBER_TWO = `sha256:${"4".repeat(64)}`;
const target = (headSha: string) => ({ repository: "arc-framework/example", pullRequest: 42, headSha });
const findingInstruction = (producerId: string, findingId: string) => ({
  producerId,
  findingId,
  locus: `src/${findingId}.ts:1`,
});

function deliveryHost(
  requests: Readonly<Record<string, {
    readonly headSha: string;
    readonly headRef?: string;
    readonly state?: "open" | "merged";
  }>>,
): Pick<DeliveryHostPort, "readRequest"> {
  return {
    readRequest: async (repository, binding) => {
      const request = requests[binding.changeRequestId];
      if (request === undefined) return { status: "absent" };
      return {
        status: "observed",
        request: {
          binding,
          repository,
          headRepository: repository,
          headRef: request.headRef ?? `member-${binding.changeRequestId}`,
          headSha: request.headSha,
          baseRef: "main",
          state: request.state ?? "open",
          draft: false,
        },
      };
    },
  };
}
const delegatedAdmission = (
  vehicle: ReturnType<typeof DeliveryReviewMemberVehicleSchema.parse>,
) => ({
  schemaVersion: 1 as const,
  sourceId: "delegated-agent" as const,
  statusTarget: { repository: "arc-framework/example", headRef: "feature", headSha: vehicle.head },
  target: target(vehicle.head),
  vehicle,
  pass: 1,
  requestedCoverage: "complete" as const,
});

function unresolvedApplicability(
  priorAttemptId = "attempt-prior",
  paths: readonly string[] = ["src/index.ts"],
) {
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: "repo-1",
    repository: "arc-framework/example",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "coderabbit-pr",
    priorAttemptId,
    priorHead: oid("a"),
    currentHead: oid("b"),
    priorBase: oid("0"),
    currentBase: oid("1"),
  };
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: oid("0"), tree: oid("2") },
        member: { head: oid("a"), tree: oid("3") },
      },
      after: {
        predecessor: { head: oid("1"), tree: oid("4") },
        member: { head: oid("b"), tree: oid("5") },
      },
    },
    proof: { status: "refused", reason: "contribution-diverged", paths: [...paths] },
  });
  if (projection.state !== "decision-required") throw new Error("expected unresolved applicability");
  return projection;
}

function attempt(
  headSha: string,
  sourceId: "coderabbit-pr" | "codex-pr",
  outcome: "pending" | "clean" | "findings" | "settled-findings" | "rate-limited",
  vehicle?: ReturnType<typeof DeliveryReviewMemberVehicleSchema.parse>,
  coverage: {
    requested: "complete" | "incremental";
    effective: "complete" | "incremental";
    evidence?: HostedCoverageEvidence;
  } = {
    requested: "complete",
    effective: "complete",
  },
) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle === undefined ? "change-set" : "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("0"),
    diffBaseTree: oid("1"),
    headSha,
    headTree: oid("2"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "hosted", qualifier: sourceId }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  const finding = {
    findingId: "finding-1",
    origin: "review-thread" as const,
    commentId: "comment-1",
    threadId: "thread-1",
    settlement: "reply-and-resolve" as const,
    severity: "major" as const,
    locus: "src/index.ts:1",
    url: "https://example.test/finding-1",
    sourceOrdinal: 1,
    sourceLabel: "Current native finding",
  };
  const hostedTarget = target(headSha);
  const admission = createHostedAdmission({
    schemaVersion: 1,
    repositoryId: "repo-1",
    lineage: vehicle === undefined
      ? { kind: "candidate", candidateId: `sha256:${"f".repeat(64)}` }
      : {
          kind: "delivery-member",
          planId: vehicle.planId,
          workUnitId: vehicle.workUnitId,
          deliverableId: vehicle.deliverableId,
        },
    logicalPass: 1,
    sourceId,
    target: hostedTarget,
    requestedCoverage: coverage.requested,
    ...(coverage.requested === "incremental"
      ? {
          correctionScope: {
            schemaVersion: 1 as const,
            predecessorProducerId: "prior-review",
            predecessorHeadSha: oid("9"),
            basisHeadSha: oid("9"),
            headSha: hostedTarget.headSha,
            requiredFindings: [],
          },
        }
      : {}),
    ...(vehicle === undefined ? {} : { vehicle }),
    reviewTarget,
    requirement,
    actorIdentity: "actor-1",
  });
  const terminal = outcome === "clean" || outcome === "findings" || outcome === "settled-findings"
      ? createHostedTerminalAttemptFixture({
        admission,
        effectiveCoverage: coverage.effective,
        ...(coverage.evidence === undefined ? {} : { coverageEvidence: coverage.evidence }),
        outcome: outcome === "clean" ? "clean" : "findings",
        findings: outcome === "findings" || outcome === "settled-findings" ? [finding] : [],
        dispositionSetId: outcome === "settled-findings" ? canonicalDigest({ disposition: 1 }) : null,
        findingActions: outcome === "settled-findings" ? [{
          findingId: finding.findingId,
          disposition: "reject",
          channelAction: "reply-and-resolve",
        }] : [],
        settledFindingIds: outcome === "settled-findings" ? [finding.findingId] : [],
        settlementEvidence: outcome === "settled-findings" ? [{
          findingId: finding.findingId,
          dispositionSetId: canonicalDigest({ disposition: 1 }),
          disposition: "reject",
          channelAction: "reply-and-resolve",
          actorIdentity: admission.actorIdentity,
          target: hostedTarget,
          fixTarget: null,
          commentId: finding.commentId,
          threadId: finding.threadId,
          replyDigest: canonicalDigest({ reply: 1 }),
          replyId: "reply-1",
          performedAt: "2026-08-31T12:01:00Z",
          carriedFromDispositionSetId: null,
        }] : [],
      })
    : null;
  return {
    attemptId: terminal?.attemptId ?? `${sourceId}-${headSha}`,
    logicalPass: admission.logicalPass,
    sourceId,
    outcome,
    hosted: terminal?.hosted ?? {
      admission,
      ...(outcome === "pending"
        ? {
            handle: {
              schemaVersion: 1 as const,
              provider: sourceId,
              requestedCoverage: coverage.requested,
              effectiveCoverage: coverage.effective,
              target: target(headSha),
              artifact: {
                kind: "issue-comment" as const,
                id: `request-${sourceId}`,
                url: `https://example.test/request-${sourceId}`,
                createdAt: "2026-08-31T12:00:00.000Z",
              },
              ...(vehicle === undefined ? {} : { vehicle }),
              admission,
            },
          }
        : {}),
      target: target(headSha),
      requestedCoverage: coverage.requested,
      effectiveCoverage: coverage.effective,
      ...(vehicle === undefined ? {} : { vehicle }),
      reviewTarget,
      requirement,
      actorIdentity: "actor-1",
      requestFailureReason: null,
      findings: outcome === "findings" || outcome === "settled-findings" ? [finding] : [],
      dispositionSetId: outcome === "settled-findings" ? canonicalDigest({ disposition: 1 }) : null,
      dispositionSetLineage: outcome === "settled-findings" ? [{
        dispositionSetId: canonicalDigest({ disposition: 1 }),
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
        findingActions: [{
          findingId: finding.findingId,
          disposition: "reject" as const,
          channelAction: "reply-and-resolve" as const,
        }],
      }] : [],
      settledFindingIds: outcome === "settled-findings" ? [finding.findingId] : [],
      settlementEvidence: outcome === "settled-findings" ? [{
        findingId: finding.findingId,
        dispositionSetId: canonicalDigest({ disposition: 1 }),
        disposition: "reject",
        channelAction: "reply-and-resolve",
        actorIdentity: admission.actorIdentity,
        target: hostedTarget,
        fixTarget: null,
        commentId: finding.commentId,
        threadId: finding.threadId,
        replyDigest: canonicalDigest({ reply: 1 }),
        replyId: "reply-1",
        performedAt: "2026-08-31T12:01:00Z",
        carriedFromDispositionSetId: null,
      }] : [],
    },
  };
}

function reservation(
  sourceId = "coderabbit-pr",
  sources: readonly string[] = [sourceId],
  targetVehicle?: {
    kind: "delivery";
    repository: string;
    workUnitId: string;
    planId: string;
  },
) {
  const common = {
    candidateId: `sha256:${"c".repeat(64)}`,
    sourceId,
    sources,
    obligation: {
      obligation: "required" as const,
      reasons: ["sensitive-change-set" as const],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"b".repeat(64)}`,
      retrigger: "full-final" as const,
      count: 1 as const,
    },
  };
  return targetVehicle === undefined
    ? createStandardReviewReservation({
        ...common,
        repository: "arc-framework/example",
        headSha: oid("a"),
      })
    : createStandardReviewReservation({ ...common, target: targetVehicle });
}

type TestLaneProgressProjection = { status: "unrecorded" } | (
  Omit<Extract<LaneProgressProjection, { status: "recorded" }>, "completePasses">
  & { completePasses?: number }
);

function progress(
  entries: Record<string, TestLaneProgressProjection>,
): (headSha: string) => Promise<LaneProgressProjection> {
  return async (headSha) => {
    const entry = entries[headSha];
    if (entry === undefined || entry.status === "unrecorded") return { status: "unrecorded" };
    return { ...entry, completePasses: entry.completePasses ?? entry.completedPasses };
  };
}

type DischargeInput = Parameters<typeof projectHostedReservationDischargeRaw>[0];
type TerminalPolicyResolvers = Pick<
  DischargeInput,
  "resolveTerminalPolicy" | "resolveEarlierTerminalPolicy"
>;
type TerminalPolicyAttempt = Parameters<TerminalPolicyResolvers[keyof TerminalPolicyResolvers]>[0];

async function defaultTerminalPolicy(
  attempt: TerminalPolicyAttempt,
) {
  const outcome = attempt.outcome === "clean" ? "clean" as const : "findings" as const;
  const coverageAdequate = "effectiveCoverage" in attempt
    ? attempt.effectiveCoverage === "complete"
    : attempt.local?.effectiveCoverage === "complete" || attempt.hosted?.effectiveCoverage === "complete";
  return resolveReviewPolicy({
    schemaVersion: 1,
    target: target(oid("a")),
    lane: "standard",
    standardReview: reservation(attempt.sourceId, [attempt.sourceId]).obligation,
    sources: [attempt.sourceId],
    maxPasses: 2,
    completedPasses: attempt.logicalPass,
    attempts: [{ sourceId: attempt.sourceId, outcome, reviewOperationId: attempt.attemptId }],
    verifiedTerminalSignal: {
      reviewOperationId: attempt.attemptId,
      confirmedFindingCount: outcome === "clean" ? 0 : 1,
      maxConfirmedSeverity: outcome === "clean" ? null : "major",
      coverageAdequate,
    },
  });
}

function projectHostedReservationDischarge(
  input: Omit<DischargeInput, keyof TerminalPolicyResolvers> & Partial<TerminalPolicyResolvers>,
) {
  return projectHostedReservationDischargeRaw({
    ...input,
    resolveTerminalPolicy: input.resolveTerminalPolicy ?? defaultTerminalPolicy,
    resolveEarlierTerminalPolicy: input.resolveEarlierTerminalPolicy ?? defaultTerminalPolicy,
  });
}

function earlierAttempt<T extends { readonly sourceId: string }>(input: T) {
  return {
    operationId: `lane-progress/${input.sourceId}`,
    attemptId: `attempt-${input.sourceId}`,
    logicalPass: 1,
    updatedAt: "2026-08-27T12:00:00.000Z",
    scopeMode: "whole-target" as const,
    ...input,
  };
}

function hostedReviewResult(input: {
  readonly producerId: string;
  readonly headSha: string;
  readonly coverage: "complete" | "incremental";
  readonly correctionScope?: {
    readonly predecessorProducerId: string;
    readonly predecessorHeadSha: string;
    readonly basisHeadSha: string;
    readonly requiredFindings: readonly ReturnType<typeof findingInstruction>[];
  };
}): ReviewResult {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("0"),
    diffBaseTree: oid("1"),
    headSha: input.headSha,
    headTree: oid("2"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: reservation("codex-pr", ["codex-pr"]).obligation,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted requirement");
  return {
    kind: "hosted",
    producerId: input.producerId,
    repositoryId: "repo-1",
    target: reviewTarget,
    sourceIdentity: "codex-pr",
    originalOutcome: "clean",
    findings: [],
    resultDigest: canonicalDigest({ producerId: input.producerId }),
    admission: {
      lineage: { kind: "candidate", candidateId: `sha256:${"f".repeat(64)}` },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: input.coverage,
      effectiveCoverage: input.coverage,
      scopeMode: "whole-target",
      policyVersion: requirement.policyVersion,
      ...(input.correctionScope === undefined
        ? {}
        : {
            correctionScope: {
              schemaVersion: 1 as const,
              ...input.correctionScope,
              headSha: input.headSha,
              requiredFindings: [...input.correctionScope.requiredFindings],
            },
          }),
    },
    laneOperationId: `lane/${input.producerId}`,
    actorIdentity: "reviewer-1",
    hostedTarget: target(input.headSha),
    requirement,
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: false,
  };
}

describe("hosted reservation discharge", () => {
  it("does not discharge the work unit from a top-only clean review", () => {
    expect(allHostedReservationTargetsDischarged([
      { discharged: false },
      { discharged: true },
    ])).toBe(false);
  });

  it("keeps the singleton target for a non-delivery work unit", async () => {
    const singleton = { ...target(oid("a")), baseRevision: oid("0") };
    await expect(resolveHostedReservationTargets({
      workUnitId: "ordinary",
      reservation: reservation(),
      singleton,
      delivery: { resolveDischargeTargets: async () => ({ status: "unbound" }) },
      host: deliveryHost({}),
    })).resolves.toEqual({ status: "resolved", kind: "singleton", targets: [singleton] });
  });

  it("derives one exact target per retained delivery binding", async () => {
    const deliveryReservation = reservation("coderabbit-pr", ["coderabbit-pr"], {
      kind: "delivery",
      repository: "arc-framework/example",
      workUnitId: "delivery",
      planId: PLAN_ID,
    });
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: deliveryReservation,
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("1"), head: oid("a"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("2"), head: oid("b"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
      host: deliveryHost({
        "41": { headSha: oid("a") },
        "42": { headSha: oid("b") },
      }),
    })).resolves.toEqual({
      status: "resolved",
      kind: "delivery",
      targets: [
        {
          repository: "arc-framework/example",
          pullRequest: 41,
          baseRevision: oid("1"),
          headSha: oid("a"),
          position: 1,
          memberCount: 2,
          chunkKey: "member-1",
          title: "Member 1",
          vehicle: {
            kind: "delivery-member",
            planId: PLAN_ID,
            deliverableId: MEMBER_ONE,
            workUnitId: "delivery",
            head: oid("a"),
          },
        },
        {
          repository: "arc-framework/example",
          pullRequest: 42,
          baseRevision: oid("2"),
          headSha: oid("b"),
          position: 2,
          memberCount: 2,
          chunkKey: "member-2",
          title: "Member 2",
          vehicle: {
            kind: "delivery-member",
            planId: PLAN_ID,
            deliverableId: MEMBER_TWO,
            workUnitId: "delivery",
            head: oid("b"),
          },
        },
      ],
    });
  });

  it("preserves each pull request's reviewed head after landing rewrites member coordinates", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("8"), head: oid("9"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("9"), head: oid("f"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
      host: deliveryHost({
        "41": { headSha: oid("a"), state: "merged" },
        "42": { headSha: oid("b"), state: "merged" },
      }),
    })).resolves.toMatchObject({
      status: "resolved",
      kind: "delivery",
      targets: [
        { pullRequest: 41, baseRevision: oid("0"), headSha: oid("a") },
        { pullRequest: 42, baseRevision: oid("a"), headSha: oid("b") },
      ],
    });
  });

  it("preserves retained authored member spans after one aggregate landing advances the Candidate base", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("d") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("a"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("a"), head: oid("b"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
      host: deliveryHost({
        "41": { headSha: oid("a"), state: "merged" },
        "42": { headSha: oid("b"), state: "merged" },
      }),
    })).resolves.toMatchObject({
      status: "resolved",
      kind: "delivery",
      targets: [
        { pullRequest: 41, baseRevision: oid("0"), headSha: oid("a") },
        { pullRequest: 42, baseRevision: oid("a"), headSha: oid("b") },
      ],
    });
  });

  it("keeps sequential reconstruction when only a merged prefix retains authored coordinates", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("d") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("a"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("a"), head: oid("b"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
      host: deliveryHost({
        "41": { headSha: oid("a"), state: "merged" },
        "42": { headSha: oid("c"), state: "merged" },
      }),
    })).resolves.toMatchObject({
      status: "resolved",
      kind: "delivery",
      targets: [
        { pullRequest: 41, baseRevision: oid("d"), headSha: oid("a") },
        { pullRequest: 42, baseRevision: oid("a"), headSha: oid("c") },
      ],
    });
  });

  it("fails closed when a retained request does not match its open member head", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: PLAN_ID, deliverableId: MEMBER_ONE,
            workUnitId: "delivery", ref: null,
            providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("a"),
            position: 1, memberCount: 1, chunkKey: "member-1", title: "Member 1",
          }],
        }),
      },
      host: deliveryHost({ "41": { headSha: oid("b") } }),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("accepts only the proven current head of an advanced terminal request", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("c")), baseRevision: oid("0") },
      terminalAdvance: { stateHead: oid("a"), currentHead: oid("c") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("9"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("9"), head: oid("a"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
      host: deliveryHost({
        "41": { headSha: oid("9") },
        "42": { headSha: oid("c") },
      }),
    })).resolves.toMatchObject({
      status: "resolved",
      kind: "delivery",
      targets: [
        { headSha: oid("9"), vehicle: { head: oid("9") } },
        { headSha: oid("c"), vehicle: { head: oid("c") } },
      ],
    });

    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("d")), baseRevision: oid("0") },
      terminalAdvance: { stateHead: oid("a"), currentHead: oid("c") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: PLAN_ID, deliverableId: MEMBER_TWO,
            workUnitId: "delivery", ref: null,
            providerId: "github", changeRequestId: "42", base: oid("9"), head: oid("a"),
            position: 1, memberCount: 1, chunkKey: "member-2", title: "Member 2",
          }],
        }),
      },
      host: deliveryHost({ "42": { headSha: oid("d") } }),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("retains the prepared terminal review target while its open request advances", async () => {
    const input = {
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery" as const,
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      singleton: { ...target(oid("9")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved" as const,
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("9"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("9"), head: oid("a"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
      host: deliveryHost({
        "41": { headSha: oid("9") },
        "42": { headSha: oid("c") },
      }),
    };

    await expect(resolveHostedReservationTargets({
      ...input,
      preparedTerminal: { deliverableId: MEMBER_TWO, stateHead: oid("a") },
    })).resolves.toMatchObject({
      status: "resolved",
      kind: "delivery",
      targets: [
        { headSha: oid("9"), vehicle: { head: oid("9") } },
        { headSha: oid("a"), vehicle: { head: oid("a") } },
      ],
    });

    await expect(resolveHostedReservationTargets({
      ...input,
      preparedTerminal: { deliverableId: MEMBER_ONE, stateHead: oid("a") },
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("fails closed when the retained ref does not match the observed head ref", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: null,
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: PLAN_ID, deliverableId: MEMBER_ONE, workUnitId: "delivery",
            ref: `refs/heads/delivery/${PLAN_ID}/member-1`,
            providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("a"),
            position: 1, memberCount: 1, chunkKey: "member-1", title: "Member 1",
          }],
        }),
      },
      host: deliveryHost({ "41": { headSha: oid("a"), headRef: "unrelated-branch" } }),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  const resolveBoundTargets = (
    targets: readonly {
      planId: string;
      deliverableId: string;
      workUnitId: string;
      ref: null;
      providerId: string;
      changeRequestId: string;
      base: string;
      head: string;
      position: number;
      memberCount: number;
      chunkKey: string;
      title: string;
    }[],
  ) => resolveHostedReservationTargets({
    workUnitId: "delivery",
    reservation: null,
    singleton: { ...target(oid("f")), baseRevision: oid("0") },
    delivery: { resolveDischargeTargets: async () => ({ status: "resolved" as const, targets }) },
    host: deliveryHost({
      "41": { headSha: oid("a") },
      "0": { headSha: oid("a") },
      "1e3": { headSha: oid("a") },
    }),
  });

  it("fails closed on duplicate change-request bindings", async () => {
    const binding = {
      planId: PLAN_ID, deliverableId: MEMBER_ONE, workUnitId: "delivery", ref: null,
      providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("a"),
      position: 1, memberCount: 1, chunkKey: "member-1", title: "Member 1",
    };

    await expect(resolveBoundTargets([binding, binding]))
      .resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it.each(["0", "1e3"])("fails closed on malformed change-request binding %s", async (changeRequestId) => {
    await expect(resolveBoundTargets([{
      planId: PLAN_ID, deliverableId: MEMBER_ONE, workUnitId: "delivery", ref: null,
      providerId: "github", changeRequestId, base: oid("0"), head: oid("a"),
      position: 1, memberCount: 1, chunkKey: "member-1", title: "Member 1",
    }])).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("keeps an unreadable delivery-member span undischarged", async () => {
    const exec: GitExec = async () => {
      throw new Error("unknown member commit");
    };
    const reader = createHostedReservationDischargeReader({
      cwd: "/tmp/repository",
      exec,
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: PLAN_ID, deliverableId: MEMBER_ONE, workUnitId: "delivery", ref: null,
            providerId: "github", changeRequestId: "41", base: oid("0"), head: oid("a"),
            position: 1, memberCount: 1, chunkKey: "member-1", title: "Member 1",
          }],
        }),
      },
      host: deliveryHost({ "41": { headSha: oid("a") } }),
    });

    await expect(reader({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      baseRevision: oid("0"),
      approvedHead: oid("a"),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    })).resolves.toEqual({
      discharged: false,
      detail: "Delivery member 1: The reserved hosted-review target span is unavailable.",
      nextSource: null,
    });
  });

  it("contains an unavailable delivery read without falling back to a single target", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("a")), baseRevision: oid("0") },
      delivery: { resolveDischargeTargets: async () => ({ status: "unavailable" }) },
      host: deliveryHost({}),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("refuses a reservation marker from a different repository", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/other",
        workUnitId: "delivery",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("a")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: "123e4567-e89b-12d3-a456-426614174000",
            deliverableId: "member-1",
            workUnitId: "delivery",
            ref: null,
            providerId: "github",
            changeRequestId: "41",
            base: oid("1"),
            head: oid("a"),
            position: 1,
            memberCount: 1,
            chunkKey: "member-1",
            title: "Member 1",
          }],
        }),
      },
      host: deliveryHost({}),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("refuses a delivery marker whose retained plan no longer matches", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: "123e4567-e89b-12d3-a456-426614174001",
            deliverableId: "member-1",
            workUnitId: "delivery",
            ref: null,
            providerId: "github",
            changeRequestId: "41",
            base: oid("1"),
            head: oid("a"),
            position: 1,
            memberCount: 1,
            chunkKey: "member-1",
            title: "Member 1",
          }],
        }),
      },
      host: deliveryHost({}),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("refuses a delivery marker whose work unit no longer matches", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "other",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: "123e4567-e89b-12d3-a456-426614174000",
            deliverableId: "member-1",
            workUnitId: "other",
            ref: null,
            providerId: "github",
            changeRequestId: "41",
            base: oid("1"),
            head: oid("a"),
            position: 1,
            memberCount: 1,
            chunkKey: "member-1",
            title: "Member 1",
          }],
        }),
      },
      host: deliveryHost({}),
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("retains only the ordered fallback span beginning at the selected source", () => {
    expect(reservation("codex-pr", ["coderabbit-pr", "codex-pr"]).sources).toEqual(["codex-pr"]);
    expect(() => reservation("codex-pr", ["coderabbit-pr"]))
      .toThrow("reserved source must belong to the ordered standard-review sources");
  });

  it("discharges a boundary that carried no reservation", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: null,
      span: [oid("a"), oid("b")],
      target: null,
      readLaneProgress: progress({}),
    })).resolves.toMatchObject({ discharged: true });
  });

  it("does not discharge an earlier clean verdict without current applicability evidence", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          completePasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "clean")],
        },
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Earlier review applicability evidence is incomplete.",
      nextSource: null,
    });
  });

  it("discharges an applicable earlier settled result only after verified nonmaterial policy", async () => {
    const prior = earlierAttempt({
      sourceId: "coderabbit-pr",
      outcome: "settled-findings",
      requestedCoverage: "complete" as const,
      effectiveCoverage: "complete" as const,
      applicability: "retain-prior-attempt" as const,
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({ status: "complete", attempts: [prior] }),
      requireEarlierApplicabilityEvidence: true,
      resolveEarlierTerminalPolicy: async () => resolveReviewPolicy({
        schemaVersion: 1,
        target: target(oid("a")),
        lane: "standard",
        standardReview: reservation("coderabbit-pr", ["coderabbit-pr"]).obligation,
        sources: ["coderabbit-pr"],
        maxPasses: 2,
        completedPasses: 1,
        attempts: [{
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: prior.attemptId,
        }],
        verifiedTerminalSignal: {
          reviewOperationId: prior.attemptId,
          confirmedFindingCount: 1,
          maxConfirmedSeverity: "minor",
          coverageAdequate: true,
        },
      }),
    });

    expect(result).toEqual({
      discharged: true,
      detail: "Hosted source `coderabbit-pr` through contribution applicability with no verified material findings.",
      nextSource: null,
    });
  });

  it("keeps a member outstanding after findings settle so the next pass can converge", async () => {
    const headSha = oid("a");
    const settled = attempt(headSha, "coderabbit-pr", "settled-findings");
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [headSha],
      target: target(headSha),
      readLaneProgress: progress({
        [headSha]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [settled],
        },
      }),
      resolveTerminalPolicy: async () => resolveReviewPolicy({
        schemaVersion: 1,
        target: target(headSha),
        lane: "standard",
        standardReview: reservation("coderabbit-pr", ["coderabbit-pr"]).obligation,
        sources: ["coderabbit-pr"],
        maxPasses: 2,
        completedPasses: 1,
        attempts: [{
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: settled.attemptId,
        }],
        verifiedTerminalSignal: {
          reviewOperationId: settled.attemptId,
          confirmedFindingCount: 1,
          maxConfirmedSeverity: "major",
          coverageAdequate: true,
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: "coderabbit-pr",
      detail: expect.stringContaining("has not produced a settled review"),
    });
  });

  it("discharges settled findings only when verified policy finds no material signal", async () => {
    const headSha = oid("a");
    const settled = attempt(headSha, "coderabbit-pr", "settled-findings");
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [headSha],
      target: target(headSha),
      readLaneProgress: progress({
        [headSha]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [settled],
        },
      }),
      resolveTerminalPolicy: async () => resolveReviewPolicy({
        schemaVersion: 1,
        target: target(headSha),
        lane: "standard",
        standardReview: reservation("coderabbit-pr", ["coderabbit-pr"]).obligation,
        sources: ["coderabbit-pr"],
        maxPasses: 2,
        completedPasses: 1,
        attempts: [{
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: settled.attemptId,
        }],
        verifiedTerminalSignal: {
          reviewOperationId: settled.attemptId,
          confirmedFindingCount: 0,
          maxConfirmedSeverity: null,
          coverageAdequate: true,
        },
      }),
    });

    expect(result).toEqual({
      discharged: true,
      detail: "Hosted source `coderabbit-pr` converged with no verified material findings.",
      nextSource: null,
    });
  });

  it("projects one exact durable await instead of requesting a pending hosted source again", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const pending = attempt(oid("b"), "coderabbit-pr", "pending", vehicle);
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [oid("b")],
      target: { ...target(oid("b")), vehicle },
      readLaneProgress: progress({
        [oid("b")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [pending],
        },
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Hosted source `coderabbit-pr` has one pending request awaiting a verdict.",
      nextSource: null,
      awaitAction: {
        schemaVersion: 1,
        handle: pending.hosted.handle,
      },
    });
  });

  it("routes unproved provider-native coverage to the typed complete-coverage selection", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [oid("b")],
      target: { ...target(oid("b")), vehicle },
      readLaneProgress: progress({
        [oid("b")]: {
          status: "recorded",
          completedPasses: 1,
          completePasses: 0,
          attempts: [attempt(
            oid("b"),
            "coderabbit-pr",
            "clean",
            vehicle,
            {
              requested: "incremental",
              effective: "incremental",
              evidence: {
                schemaVersion: 1,
                kind: "provider-native-incremental",
                sourceId: "coderabbit-pr",
                requestArtifactId: "comment-1",
                status: "unestablished",
                reason: "provider-incremental-range-mismatch",
              },
            },
          )],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: null,
      detail: expect.stringContaining("coverage-required/select-coverage"),
      coverageSelectionAction: {
        schemaVersion: 1,
        kind: "review-coverage-selection",
        workUnitId: "delivery",
        sourceId: "coderabbit-pr",
        pass: 1,
        completedPasses: 1,
        consumedPass: true,
        choices: [{ sourceId: "coderabbit-pr", coverage: "complete" }],
        interactionText: expect.stringContaining("--coverage"),
      },
    });
  });

  it("preserves an incremental terminal result as coverage-required policy evidence", async () => {
    const headSha = oid("b");
    const incremental = attempt(
      headSha,
      "coderabbit-pr",
      "clean",
      undefined,
      { requested: "incremental", effective: "incremental" },
    );
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [headSha],
      target: target(headSha),
      readLaneProgress: progress({
        [headSha]: {
          status: "recorded",
          completedPasses: 1,
          completePasses: 0,
          attempts: [incremental],
        },
      }),
      resolveTerminalPolicy: async () => resolveReviewPolicy({
        schemaVersion: 1,
        target: target(headSha),
        lane: "standard",
        standardReview: reservation("coderabbit-pr", ["coderabbit-pr"]).obligation,
        sources: ["coderabbit-pr"],
        maxPasses: 2,
        completedPasses: 1,
        attempts: [{
          sourceId: "coderabbit-pr",
          outcome: "clean",
          reviewOperationId: incremental.attemptId,
        }],
        verifiedTerminalSignal: {
          reviewOperationId: incremental.attemptId,
          confirmedFindingCount: 0,
          maxConfirmedSeverity: null,
          coverageAdequate: false,
        },
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "The terminal review producer did not establish convergence (coverage-required/select-coverage).",
      nextSource: null,
    });
  });

  it("discharges the exact member from the driver's delegated-agent result", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: vehicle.head,
      headTree: oid("2"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [vehicle.head],
      target: { ...target(vehicle.head), vehicle },
      readLaneProgress: progress({
        [vehicle.head]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [{
            attemptId: "local-review-1",
            logicalPass: 1,
            sourceId: "delegated-agent",
            outcome: "clean",
            local: {
              vehicle: { kind: "delivery-member", identity: MEMBER_ONE },
              target: localTarget,
              requestedCoverage: "complete",
              effectiveCoverage: "complete",
              scopeMode: "whole-target",
              deliveryAdmission: delegatedAdmission(vehicle),
            },
          }],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      nextSource: null,
      detail: "Standard source `delegated-agent`.",
    });
  });

  it("resumes exact delegated-agent findings before selecting another source", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: vehicle.head,
      headTree: oid("2"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [vehicle.head],
      target: { ...target(vehicle.head), vehicle },
      readLaneProgress: progress({
        [vehicle.head]: {
          status: "recorded",
          completedPasses: 1,
          completePasses: 1,
          attempts: [{
            attemptId: "local-review-1",
            logicalPass: 1,
            sourceId: "delegated-agent",
            outcome: "findings",
            local: {
              vehicle: { kind: "delivery-member", identity: MEMBER_ONE },
              target: localTarget,
              requestedCoverage: "complete",
              effectiveCoverage: "complete",
              scopeMode: "whole-target",
              deliveryAdmission: delegatedAdmission(vehicle),
            },
          }],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: null,
      localResumeAction: { schemaVersion: 1, operationId: "local-review-1" },
    });
  });

  it("excludes a coincident hosted attempt for a different delivery member", async () => {
    const expectedVehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: "123e4567-e89b-12d3-a456-426614174000",
      deliverableId: `sha256:${"1".repeat(64)}`,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const otherVehicle = DeliveryReviewMemberVehicleSchema.parse({
      ...expectedVehicle,
      deliverableId: `sha256:${"2".repeat(64)}`,
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: expectedVehicle.planId,
      }),
      span: [oid("a"), oid("b")],
      target: { ...target(oid("b")), vehicle: expectedVehicle },
      readLaneProgress: progress({
        [oid("b")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("b"), "coderabbit-pr", "clean", otherVehicle)],
        },
      }),
    });

    expect(result.discharged).toBe(false);
  });

  it("preserves native navigation when routing current findings for disposition", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a")],
      target: target(oid("a")),
      bindCurrentAttemptRef: () => "arc-review-source:v1:hosted:lane-progress%2Fcurrent:hosted%2Fcurrent",
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "findings")],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      responsePlan: {
        findings: [{
          findingId: "finding-1",
          sourceOrdinal: 1,
          sourceLabel: "Current native finding",
        }],
      },
    });
  });

  it("discharges from the next ordered source only after the preferred source was safely unavailable", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [
            attempt(oid("a"), "coderabbit-pr", "rate-limited"),
            attempt(oid("a"), "codex-pr", "clean"),
          ],
        },
      }),
    });

    expect(result).toMatchObject({ discharged: true, detail: "Hosted source `codex-pr`." });
  });

  it("selects the next ordered source for an outstanding member after safe unavailability", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [attempt(oid("a"), "coderabbit-pr", "rate-limited")],
        },
      }),
    });

    expect(result).toMatchObject({ discharged: false, nextSource: "codex-pr" });
  });

  it("retains incremental coverage while selecting fallback within the active pass", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [attempt(
            oid("a"),
            "coderabbit-pr",
            "rate-limited",
            undefined,
            { requested: "incremental", effective: "incremental" },
          )],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: "codex-pr",
      requestCoverage: "incremental",
    });
  });

  it("does not accept a lower source without safe-unavailability evidence for the ordered prefix", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "codex-pr", "clean")],
        },
      }),
    });

    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("coderabbit-pr");
  });

  it("accepts a lower local source after its exact delivery admission was validated", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("a"),
    });
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: vehicle.head,
      headTree: oid("2"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "delegated-agent"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [vehicle.head],
      target: { ...target(vehicle.head), vehicle },
      readLaneProgress: progress({
        [vehicle.head]: {
          status: "recorded",
          completedPasses: 1,
          completePasses: 1,
          attempts: [{
            attemptId: "local-review-1",
            logicalPass: 1,
            sourceId: "delegated-agent",
            outcome: "clean",
            local: {
              vehicle: { kind: "delivery-member", identity: MEMBER_ONE },
              target: localTarget,
              requestedCoverage: "complete",
              effectiveCoverage: "complete",
              scopeMode: "chunked",
              deliveryAdmission: {
                ...delegatedAdmission(vehicle),
                scopeSelection: {
                  mode: "chunked",
                  target: target(vehicle.head),
                },
              },
            },
          }],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      nextSource: null,
      detail: "Standard source `delegated-agent`.",
    });
  });

  it("leaves the reservation pending when the reserved source reached no verdict", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [
            attempt(oid("a"), "coderabbit-pr", "rate-limited"),
            attempt(oid("a"), "codex-pr", "clean"),
          ],
        },
      }),
    });

    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("coderabbit-pr");
  });

  it("uses the current head for fallback after historical findings", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "findings")],
        },
        [oid("b")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [
            attempt(oid("b"), "coderabbit-pr", "rate-limited"),
            attempt(oid("b"), "codex-pr", "clean"),
          ],
        },
      }),
    });

    expect(result).toMatchObject({ discharged: true, detail: "Hosted source `codex-pr`." });
  });

  it("keeps prior safe unavailability and fallback discharge after an applicable top-head move", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async (sourceId) => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId,
          outcome: sourceId === "coderabbit-pr" ? "rate-limited" : "clean",
          requestedCoverage: "complete",
          effectiveCoverage: sourceId === "coderabbit-pr" ? null : "complete",
          applicability: "retain-prior-attempt",
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      detail: "Hosted source `codex-pr` through contribution applicability.",
      nextSource: null,
    });
  });

  it("retains a provider-upgraded complete review after an applicable head move", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "clean",
          requestedCoverage: "incremental",
          effectiveCoverage: "complete",
          applicability: "retain-prior-attempt",
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      detail: "Hosted source `coderabbit-pr` through contribution applicability.",
      nextSource: null,
    });
  });

  it.each(["clean", "settled-findings"] as const)(
    "admits retained incremental %s evidence to complete-chain policy validation",
    async (terminalOutcome) => {
    const resolveEarlierTerminalPolicy = async (terminal: TerminalPolicyAttempt) => resolveReviewPolicy({
      schemaVersion: 1,
      target: target(oid("b")),
      lane: "standard",
      standardReview: reservation("coderabbit-pr", ["coderabbit-pr"]).obligation,
      sources: ["coderabbit-pr"],
      maxPasses: 2,
      completedPasses: terminal.logicalPass,
      attempts: [{
        sourceId: terminal.sourceId,
        outcome: terminalOutcome === "clean" ? "clean" : "findings",
        reviewOperationId: terminal.attemptId,
      }],
      verifiedTerminalSignal: {
        reviewOperationId: terminal.attemptId,
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        coverageAdequate: true,
      },
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: terminalOutcome,
          requestedCoverage: "incremental",
          effectiveCoverage: "incremental",
          applicability: "retain-prior-attempt",
        })],
      }),
      resolveEarlierTerminalPolicy,
    });

    expect(result).toEqual({
      discharged: true,
      detail: terminalOutcome === "clean"
        ? "Hosted source `coderabbit-pr` through contribution applicability."
        : "Hosted source `coderabbit-pr` through contribution applicability with no verified material findings.",
      nextSource: null,
    });
  });

  it("routes retained incremental evidence with an inadequate chain to coverage selection", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: "attempt-coderabbit-pr",
      predecessorHeadSha: oid("a"),
      basisHeadSha: oid("a"),
      headSha: oid("b"),
      requiredFindings: [],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [oid("b")],
      target: { ...target(oid("b")), vehicle },
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "clean",
          requestedCoverage: "incremental",
          effectiveCoverage: "incremental",
          applicability: "retain-prior-attempt",
        })],
      }),
      resolveIncrementalCorrectionScope: async () => correctionScope,
    });

    expect(result).toMatchObject({
      discharged: false,
      detail: "The retained terminal review producer did not establish convergence "
        + "(coverage-required/select-coverage).",
      nextSource: null,
      correctionScope,
      coverageSelectionAction: {
        schemaVersion: 1,
        kind: "review-coverage-selection",
        workUnitId: "delivery",
        sourceId: "coderabbit-pr",
        pass: 1,
        completedPasses: 1,
        consumedPass: true,
        choices: [
          { sourceId: "coderabbit-pr", coverage: "incremental" },
          { sourceId: "coderabbit-pr", coverage: "complete" },
        ],
        interactionText: expect.stringContaining("--coverage"),
      },
    });
  });

  it("routes an applicable prior findings attempt back to its exact response plan", async () => {
    const responsePlan = {
      schemaVersion: 1 as const,
      target: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("a"),
        headTree: oid("2"),
      }),
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
      },
      findings: [{
        findingId: "finding-1",
        severity: "major" as const,
        locus: "src/index.ts:1",
        evidenceUrlOrId: "https://example.test/finding-1",
        sourceOrdinal: 1,
      }],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "retain-prior-attempt",
          responsePlan,
        })],
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Hosted source `coderabbit-pr` has retained findings awaiting disposition.",
      nextSource: null,
      responsePlan,
    });
  });

  it("routes applicable earlier delegated findings back to the exact local operation", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "delegated-agent",
          outcome: "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "retain-prior-attempt",
          localResumeAction: { schemaVersion: 1, operationId: "local-review-prior" },
        })],
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Standard source `delegated-agent` has retained local findings awaiting disposition.",
      nextSource: null,
      localResumeAction: { schemaVersion: 1, operationId: "local-review-prior" },
    });
  });

  it("returns retained findings before an Owner-selected replacement review", async () => {
    const responsePlan = {
      schemaVersion: 1 as const,
      target: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("a"),
        headTree: oid("2"),
      }),
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
      },
      findings: [{
        findingId: "finding-1",
        severity: "major" as const,
        locus: "src/index.ts:1",
        evidenceUrlOrId: "https://example.test/finding-1",
        sourceOrdinal: 1,
      }],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "request-review",
          responsePlan,
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: null,
      responsePlan,
    });
  });

  it("returns retained findings on a later source before requesting a higher-ranked source", async () => {
    const responsePlan = {
      schemaVersion: 1 as const,
      target: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("a"),
        headTree: oid("2"),
      }),
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
      },
      findings: [{
        findingId: "finding-1",
        severity: "major" as const,
        locus: "src/index.ts:1",
        evidenceUrlOrId: "https://example.test/finding-1",
        sourceOrdinal: 1,
      }],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async (sourceId) => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId,
          outcome: sourceId === "coderabbit-pr" ? "settled-findings" : "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: sourceId === "coderabbit-pr" ? "request-review" : "retain-prior-attempt",
          ...(sourceId === "codex-pr" ? { responsePlan } : {}),
        })],
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Hosted source `codex-pr` has retained findings awaiting disposition.",
      nextSource: null,
      responsePlan,
    });
  });

  it("does not discharge earlier settled findings selected for current-head review", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "settled-findings")],
        },
      }),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "settled-findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "request-review",
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: "coderabbit-pr",
    });
  });

  it("carries a source-neutral complete predecessor into a local correction request", async () => {
    const priorTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: oid("a"),
      headTree: oid("2"),
    });
    const prior = earlierAttempt({
      attemptId: "hosted/prior-complete",
      sourceId: "codex-pr",
      outcome: "clean",
      requestedCoverage: "complete" as const,
      effectiveCoverage: "complete" as const,
      producerTarget: priorTarget,
      applicability: "request-review" as const,
    });
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: prior.attemptId,
      predecessorHeadSha: prior.producerTarget.headSha,
      basisHeadSha: prior.producerTarget.headSha,
      headSha: oid("b"),
      requiredFindings: [],
    };

    await expect(projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent", "codex-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async (sourceId) => sourceId === "codex-pr"
        ? { status: "complete", attempts: [prior] }
        : { status: "not-found" },
      resolveIncrementalCorrectionScope: async (attempt, currentHeadSha) => (
        attempt.attemptId === prior.attemptId && currentHeadSha === oid("b")
          ? correctionScope
          : null
      ),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: "delegated-agent",
      correctionScope,
    });
  });

  it("uses the newest responded same-head terminal producer as the correction predecessor", async () => {
    const headSha = oid("b");
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: headSha,
    });
    const current = attempt(headSha, "codex-pr", "settled-findings", vehicle);
    const producerTarget = current.hosted?.reviewTarget;
    if (producerTarget === undefined) throw new Error("expected hosted producer target");
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: current.attemptId,
      predecessorHeadSha: headSha,
      basisHeadSha: headSha,
      headSha,
      requiredFindings: [findingInstruction(current.attemptId, "finding-current")],
    };

    await expect(projectHostedReservationDischarge({
      reservation: reservation("codex-pr", ["codex-pr", "delegated-agent"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [headSha],
      target: { ...target(headSha), vehicle },
      readLaneProgress: progress({
        [headSha]: {
          status: "recorded",
          completedPasses: 1,
          completePasses: 1,
          attempts: [current],
        },
      }),
      readEarlierAttemptApplicability: async () => ({ status: "not-found" }),
      resolveIncrementalCorrectionScope: async (candidate, currentHeadSha) => (
        candidate.attemptId === current.attemptId
          && candidate.sourceId === current.sourceId
          && candidate.producerTarget?.targetId === producerTarget.targetId
          && currentHeadSha === headSha
          ? correctionScope
          : null
      ),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: "codex-pr",
      correctionScope,
    });
  });

  it("extends the latest incremental predecessor instead of skipping back to its complete root", async () => {
    const completeTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: oid("a"),
      headTree: oid("2"),
    });
    const incrementalTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: oid("b"),
      headTree: oid("3"),
    });
    const complete = earlierAttempt({
      attemptId: "hosted/complete-a",
      logicalPass: 1,
      updatedAt: "2026-08-27T12:00:00.000Z",
      sourceId: "codex-pr",
      outcome: "clean",
      requestedCoverage: "complete" as const,
      effectiveCoverage: "complete" as const,
      producerTarget: completeTarget,
      applicability: "request-review" as const,
    });
    const incremental = earlierAttempt({
      attemptId: "hosted/incremental-b",
      logicalPass: 2,
      updatedAt: "2026-08-28T12:00:00.000Z",
      sourceId: "codex-pr",
      outcome: "settled-findings",
      requestedCoverage: "incremental" as const,
      effectiveCoverage: "incremental" as const,
      producerTarget: incrementalTarget,
      applicability: "request-review" as const,
    });
    const expectedScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: incremental.attemptId,
      predecessorHeadSha: incremental.producerTarget.headSha,
      basisHeadSha: complete.producerTarget.headSha,
      headSha: oid("c"),
      requiredFindings: [
        findingInstruction(complete.attemptId, "finding-a"),
        findingInstruction(incremental.attemptId, "finding-b"),
      ],
    };

    await expect(projectHostedReservationDischarge({
      reservation: reservation("codex-pr", ["codex-pr"]),
      span: [oid("c")],
      target: target(oid("c")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [complete, incremental],
      }),
      resolveIncrementalCorrectionScope: async (candidate) => candidate.attemptId === incremental.attemptId
        ? expectedScope
        : {
            ...expectedScope,
            predecessorProducerId: complete.attemptId,
            predecessorHeadSha: complete.producerTarget.headSha,
            requiredFindings: [findingInstruction(complete.attemptId, "finding-a")],
          },
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: "codex-pr",
      correctionScope: expectedScope,
    });
  });

  it("does not skip an unusable latest predecessor to manufacture an older correction scope", async () => {
    const producerTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: oid("a"),
      headTree: oid("2"),
    });
    const complete = earlierAttempt({
      attemptId: "hosted/complete-a",
      logicalPass: 1,
      sourceId: "codex-pr",
      outcome: "clean",
      requestedCoverage: "complete" as const,
      effectiveCoverage: "complete" as const,
      producerTarget,
      applicability: "request-review" as const,
    });
    const incremental = earlierAttempt({
      attemptId: "hosted/incremental-b",
      logicalPass: 2,
      sourceId: "codex-pr",
      outcome: "settled-findings",
      requestedCoverage: "incremental" as const,
      effectiveCoverage: "incremental" as const,
      producerTarget: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("b"),
        headTree: oid("3"),
      }),
      applicability: "request-review" as const,
    });

    const projected = await projectHostedReservationDischarge({
      reservation: reservation("codex-pr", ["codex-pr"]),
      span: [oid("c")],
      target: target(oid("c")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [complete, incremental],
      }),
      resolveIncrementalCorrectionScope: async (candidate) => candidate.attemptId === complete.attemptId
        ? {
            schemaVersion: 1,
            predecessorProducerId: complete.attemptId,
            predecessorHeadSha: complete.producerTarget.headSha,
            basisHeadSha: complete.producerTarget.headSha,
            headSha: oid("c"),
            requiredFindings: [],
          }
        : null,
    });

    expect(projected).not.toHaveProperty("correctionScope");
  });

  it("carries an incremental predecessor's basis and transitive material instructions", () => {
    const predecessor = hostedReviewResult({
      producerId: "hosted/incremental-b",
      headSha: oid("b"),
      coverage: "incremental",
      correctionScope: {
        predecessorProducerId: "hosted/complete-a",
        predecessorHeadSha: oid("a"),
        basisHeadSha: oid("a"),
        requiredFindings: [findingInstruction("hosted/complete-a", "finding-a")],
      },
    });

    expect(buildIncrementalCorrectionScope({
      predecessor,
      currentHeadSha: oid("c"),
      response: {
        status: "performed",
        requiredFindings: [findingInstruction(predecessor.producerId, "finding-b")],
      },
    })).toEqual({
      schemaVersion: 1,
      predecessorProducerId: predecessor.producerId,
      predecessorHeadSha: oid("b"),
      basisHeadSha: oid("a"),
      headSha: oid("c"),
      requiredFindings: [
        findingInstruction("hosted/complete-a", "finding-a"),
        findingInstruction(predecessor.producerId, "finding-b"),
      ],
    });
  });

  it("confirms every chain predecessor against the current target rather than only the direct link", async () => {
    const complete = hostedReviewResult({
      producerId: "hosted/complete-a",
      headSha: oid("a"),
      coverage: "complete",
    });
    const current = hostedReviewResult({
      producerId: "hosted/incremental-c",
      headSha: oid("c"),
      coverage: "incremental",
      correctionScope: {
        predecessorProducerId: "hosted/incremental-b",
        predecessorHeadSha: oid("b"),
        basisHeadSha: oid("a"),
        requiredFindings: [],
      },
    });

    await expect(confirmIncrementalPredecessorApplicability({
      predecessor: complete,
      current,
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          attemptId: complete.producerId,
          sourceId: "codex-pr",
          outcome: "clean",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          producerTarget: complete.target,
          applicability: "request-review",
        })],
      }),
    })).resolves.toBe("applicable");
  });

  it("recognizes an exact predecessor after retained or requested current-head review", () => {
    const producerTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: oid("a"),
      headTree: oid("2"),
    });
    const projected = (applicability: "retain-prior-attempt" | "request-review" | "stop") => ({
      status: "complete" as const,
      attempts: [earlierAttempt({
        attemptId: "hosted/prior-complete",
        sourceId: "codex-pr",
        outcome: "clean",
        requestedCoverage: "complete" as const,
        effectiveCoverage: "complete" as const,
        producerTarget,
        applicability,
      })],
    });

    for (const applicability of ["retain-prior-attempt", "request-review"] as const) {
      expect(incrementalApplicabilityFromEarlierRead({
        producerId: "hosted/prior-complete",
        producerTarget,
        earlier: projected(applicability),
      })).toBe("applicable");
    }
    expect(incrementalApplicabilityFromEarlierRead({
      producerId: "hosted/prior-complete",
      producerTarget,
      earlier: projected("stop"),
    })).toBe("unavailable");
  });

  it("does not spend provider capacity for an unresolved or unavailable prior projection", async () => {
    for (const readEarlierAttemptApplicability of [
      async () => ({
        status: "complete" as const,
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete" as const,
          effectiveCoverage: null,
          applicability: "stop" as const,
        })],
      }),
      async () => ({ status: "unavailable" as const, detail: "Operation snapshot is incomplete." }),
      async () => ({ status: "complete" as const, attempts: [] }),
    ]) {
      await expect(projectHostedReservationDischarge({
        reservation: reservation(),
        span: [oid("b")],
        target: target(oid("b")),
        readLaneProgress: progress({}),
        readEarlierAttemptApplicability,
      })).resolves.toMatchObject({ discharged: false, nextSource: null });
    }
  });

  it("carries the exact unresolved projection to the status consumer", async () => {
    const projection = unresolvedApplicability();
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete",
          effectiveCoverage: null,
          applicability: "stop",
          projection,
        })],
      }),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: null,
      applicability: projection,
    });
  });

  it("carries one equivalent class of unresolved projections to the status consumer", async () => {
    const first = unresolvedApplicability("attempt-first");
    const second = unresolvedApplicability("attempt-second");
    const distinctResidual = unresolvedApplicability("attempt-third", ["src/other.ts"]);
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [first, second, distinctResidual].map((projection, index) => earlierAttempt({
          attemptId: `attempt-${String(index + 1)}`,
          updatedAt: `2026-08-27T12:0${String(index)}:00.000Z`,
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete",
          effectiveCoverage: null,
          applicability: "stop",
          projection,
          authorityState: "decision-required",
        })),
      }),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: null,
      applicability: first,
      equivalentApplicabilities: [first, second],
    });
  });

  it("admits the same source when the replayed Owner selection requires review", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete",
          effectiveCoverage: null,
          applicability: "request-review",
        })],
      }),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: "coderabbit-pr",
      detail: expect.stringContaining("Owner selection"),
    });
  });

  it("does not let canonical authority discharge after its machine-local attempt disappears", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({ status: "not-found" }),
      requireEarlierApplicabilityEvidence: true,
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: null,
      detail: "Earlier review applicability evidence is incomplete.",
    });
  });
});

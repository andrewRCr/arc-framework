/** Storage-neutral discovery of exact earlier hosted review attempts. */

import { describe, expect, it } from "vitest";

import { createHostedTerminalAttemptFixture } from "../../../../fixtures/hosted-review.js";

import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../../../../src/lib/canonical/canonical-json.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateLineageTransitionV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import { LaneProgressStateSchema } from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createFrontlineAdmission } from
  "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createHostedAdmission } from
  "../../../../../src/scripts/review-gate/hosted/request.js";
import { queryEarlierReviewAttempts } from
  "../../../../../src/scripts/review-gate/policy/earlier-review-attempts.js";
import { reduceReviewRouting } from
  "../../../../../src/scripts/review-gate/policy/routing.js";
import {
  candidateExpectsEarlierReviewAttempt,
  earlierAttemptRetainsReservationPosition,
  projectEarlierReviewApplicability,
} from
  "../../../../../src/scripts/review-gate/policy/earlier-review-applicability.js";
import { DeliveryLocalReviewAdmissionSchema } from
  "../../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { classifyReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import { ApprovedDispositionRecordSchema } from
  "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  consumeFixAuthorization,
  createFixAuthorization,
} from "../../../../../src/scripts/review-gate/core/fix-authorization.js";

const oid = (character: string): string => character.repeat(40);

const deliveryVehicle = (head: string, workUnitId = "member-a") => DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"9".repeat(64)}`,
  workUnitId,
  head,
});

const localAdmission = (head: string) => DeliveryLocalReviewAdmissionSchema.parse({
  schemaVersion: 1,
  sourceId: "delegated-agent",
  statusTarget: { repository: "owner/repository", headRef: "feature", headSha: head },
  target: { repository: "owner/repository", pullRequest: 42, headSha: head },
  vehicle: deliveryVehicle(head),
  pass: 1,
});

function laneState(options: {
  delivery?: boolean;
  candidateId?: string;
  repositoryId?: string;
  headSha?: string;
  sourceId?: "codex-pr" | "coderabbit-pr";
  targetRepository?: string;
  pullRequest?: number;
  artifactId?: string;
  vehicle?: ReturnType<typeof deliveryVehicle>;
} = {}) {
  const repositoryId = options.repositoryId ?? "repository-1";
  const headSha = options.headSha ?? oid("a");
  const sourceId = options.sourceId ?? "codex-pr";
  const vehicle = options.vehicle ?? (options.delivery === true ? deliveryVehicle(headSha) : undefined);
  const lineage = vehicle === undefined
    ? {
        kind: "candidate" as const,
        candidateId: options.candidateId ?? `sha256:${"8".repeat(64)}`,
      }
    : {
        kind: "delivery-member" as const,
        planId: vehicle.planId,
        workUnitId: vehicle.workUnitId,
        deliverableId: vehicle.deliverableId,
      };
  const target = {
    repository: options.targetRepository ?? "Owner/Repository",
    pullRequest: options.pullRequest ?? 42,
    headSha,
  };
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle === undefined ? "change-set" : "delivery-member",
    repositoryId,
    baseRef: "main",
    diffBaseSha: oid("1"),
    diffBaseTree: oid("2"),
    headSha,
    headTree: oid("3"),
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
    acceptableSources: [{ sourceKind: "hosted", qualifier: sourceId }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted requirement");
  const admission = createHostedAdmission({
    schemaVersion: 1,
    repositoryId,
    lineage,
    logicalPass: 1,
    sourceId,
    target,
    requestedCoverage: "complete",
    ...(vehicle === undefined ? {} : { vehicle }),
    reviewTarget,
    requirement,
    actorIdentity: "github-user-1",
  });
  const terminal = createHostedTerminalAttemptFixture({
    admission,
    artifact: {
      kind: "issue-comment",
      id: options.artifactId ?? "comment-1",
      url: `https://example.invalid/${options.artifactId ?? "comment-1"}`,
      createdAt: "2026-08-15T11:00:00Z",
    },
    outcome: "clean",
  });
  return LaneProgressStateSchema.parse({
    schemaVersion: 1 as const,
    semanticsVersion: "review-operation/v1" as const,
    operationId: "lane-progress/prior",
    updatedAt: "2026-08-23T12:00:00Z",
    kind: "lane-progress" as const,
    lane: "standard" as const,
    repositoryId,
    lineage,
    completedPasses: 1,
    attempts: [{
      attemptId: terminal.attemptId,
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: "pull/42",
      headSha,
      terminalProducer: true,
      sourceId,
      outcome: "clean" as const,
      hosted: terminal.hosted,
    }],
  });
}

function frontlineLaneState() {
  const base = laneState();
  const prior = base.attempts[0];
  if (prior === undefined || prior.hosted === undefined) throw new Error("expected hosted attempt");
  const facts = {
    schemaVersion: 1 as const,
    changeSetState: "known" as const,
    contentKind: "code-bearing" as const,
    reviewRisk: "routine" as const,
    changeDeterminacy: "ordinary" as const,
    ownership: "self" as const,
    surfaceAuthority: "ordinary" as const,
    assurance: { workContext: "work-unit" as const, workClass: "Light" as const },
    activity: { selfReview: true, frontlineReview: true },
  };
  const source = {
    sourceId: "review-cli",
    kind: "command" as const,
    executable: "reviewer",
    argv: ["--plain"],
  };
  const admission = createFrontlineAdmission({
    lineage: base.lineage,
    target: prior.hosted.reviewTarget,
    routing: { facts, decision: reduceReviewRouting(facts) },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source,
      maxPasses: 2,
      promptText: "Review the aggregate candidate.",
    },
    logicalPass: prior.logicalPass,
    retryGeneration: prior.retryGeneration,
    maxPasses: 2,
  });
  const attempt = { ...prior };
  delete attempt.hosted;
  return {
    ...base,
    lane: "frontline" as const,
    attempts: [{
      ...attempt,
      attemptId: admission.operationId,
      changeRequestId: null,
      sourceId: source.sourceId,
      frontline: { admission, effectiveCoverage: "complete" as const },
    }],
  };
}

function selector(currentVehicle?: ReturnType<typeof deliveryVehicle>) {
  return {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    currentHead: oid("c"),
    lane: "standard" as const,
    sourceId: "codex-pr",
    lineage: currentVehicle === undefined
      ? { kind: "candidate" as const, candidateId: `sha256:${"8".repeat(64)}` }
      : {
          kind: "delivery-member" as const,
          planId: currentVehicle.planId,
          workUnitId: currentVehicle.workUnitId,
          deliverableId: currentVehicle.deliverableId,
        },
    ...(currentVehicle === undefined ? {} : { currentVehicle }),
  };
}

const stableEndpoints = async (value: { readonly currentHead: string; readonly currentBase: string }) => ({
  head: value.currentHead,
  base: value.currentBase,
});

function candidateRecord(transitions: readonly CandidateLineageTransitionV1[] = []) {
  const subject = createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "root" }),
    treatment: "reviewable",
  }]);
  const attestation = createCandidateAttestation({
    workUnit: "example",
    subject,
    baseRevision: oid("0"),
    attestedBy: "andrew",
    attestedAt: "2026-08-23T10:00:00.000Z",
    verificationEvidenceRef: "verification://root",
  });
  return {
    schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const,
    attestation,
    subject,
    transitions: [...transitions],
    lineageAttestations: [],
  };
}

function applicabilityDecision(
  applicabilitySelector: Parameters<typeof classifyReviewContributionApplicability>[0],
) {
  return classifyReviewContributionApplicability(applicabilitySelector, {
    endpoints: {
      before: {
        predecessor: { head: applicabilitySelector.priorBase, tree: oid("3") },
        member: { head: applicabilitySelector.priorHead, tree: oid("4") },
      },
      after: {
        predecessor: { head: applicabilitySelector.currentBase, tree: oid("5") },
        member: { head: applicabilitySelector.currentHead, tree: oid("6") },
      },
    },
    proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
  });
}

function mechanicalApplicability(
  applicabilitySelector: Parameters<typeof classifyReviewContributionApplicability>[0],
) {
  return classifyReviewContributionApplicability(applicabilitySelector, {
    endpoints: {
      before: {
        predecessor: { head: applicabilitySelector.priorBase, tree: oid("3") },
        member: { head: applicabilitySelector.priorHead, tree: oid("4") },
      },
      after: {
        predecessor: { head: applicabilitySelector.currentBase, tree: oid("5") },
        member: { head: applicabilitySelector.currentHead, tree: oid("6") },
      },
    },
    proof: { status: "accepted", proof: "mechanical-reapply" },
  });
}

describe("earlier review attempt query", () => {
  it("retains hosted reservation position for raw findings", () => {
    expect(earlierAttemptRetainsReservationPosition("findings")).toBe(true);
  });

  it("returns the complete exact candidate set from one complete operation snapshot", () => {
    const prior = laneState();
    expect(queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [{ version: 2, state: prior }],
    })).toMatchObject({
      status: "complete",
      candidates: [{
        operationId: "lane-progress/prior",
        version: 2,
        attemptId: prior.attempts[0]?.attemptId,
        sourceId: "codex-pr",
        priorHead: oid("a"),
        target: { repository: "Owner/Repository", pullRequest: 42, headSha: oid("a") },
      }],
    });
  });

  it("excludes every mismatched repository, request, lane, source, and current-head dimension", () => {
    const base = laneState();
    const variants = [
      laneState({ repositoryId: "repository-2" }),
      {
        ...base,
        attempts: base.attempts.map((attempt) => ({ ...attempt, changeRequestId: "pull/43" })),
      },
      frontlineLaneState(),
      laneState({ headSha: oid("c") }),
      laneState({ sourceId: "coderabbit-pr" }),
      laneState({ targetRepository: "other/repository" }),
      laneState({ pullRequest: 43 }),
    ].map((state) => LaneProgressStateSchema.parse(state));

    for (const state of variants) {
      expect(queryEarlierReviewAttempts(selector(), {
        status: "complete",
        records: [{ version: 1, state }],
      })).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
    }
  });

  it("excludes an earlier attempt owned by another Candidate lineage", () => {
    expect(queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [{
        version: 1,
        state: laneState({ candidateId: `sha256:${"7".repeat(64)}` }),
      }],
    })).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
  });

  it("requires the same exact delivery member identity while allowing its head coordinate to move", () => {
    const input = selector(deliveryVehicle(oid("c")));
    const snapshot = { status: "complete" as const, records: [{ version: 1, state: laneState({ delivery: true }) }] };
    expect(queryEarlierReviewAttempts(input, snapshot)).toMatchObject({
      status: "complete",
      candidates: [{
        priorHead: oid("a"),
        priorVehicle: deliveryVehicle(oid("a")),
      }],
    });
    expect(queryEarlierReviewAttempts({
      ...input,
      currentVehicle: DeliveryReviewMemberVehicleSchema.parse({
        ...input.currentVehicle,
        workUnitId: "member-b",
      }),
    }, snapshot)).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
  });

  it("discovers an exact delegated delivery-member attempt after its head coordinate moves", () => {
    const prior = laneState({ delivery: true });
    const priorTarget = prior.attempts[0]!.hosted!.reviewTarget;
    const local = LaneProgressStateSchema.parse({
      ...prior,
      attempts: [{
        attemptId: "local-review-prior",
        logicalPass: 1,
        retryGeneration: 0,
        changeRequestId: null,
        headSha: oid("a"),
        terminalProducer: true,
        sourceId: "delegated-agent",
        outcome: "clean",
        local: {
          operationId: "local-review-prior",
          requestId: canonicalDigest({ request: "local-review-prior" }),
          vehicle: { kind: "delivery-member", identity: deliveryVehicle(oid("a")).deliverableId },
          target: priorTarget,
          requestedCoverage: "incremental",
          effectiveCoverage: "incremental",
          deliveryAdmission: localAdmission(oid("a")),
        },
      }],
    });

    expect(queryEarlierReviewAttempts({
      ...selector(deliveryVehicle(oid("c"))),
      sourceId: "delegated-agent",
    }, {
      status: "complete",
      records: [{ version: 1, state: local }],
    })).toMatchObject({
      status: "complete",
      candidates: [{
        sourceKind: "local",
        attemptId: "local-review-prior",
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
        priorHead: oid("a"),
        priorVehicle: deliveryVehicle(oid("a")),
        reviewTarget: priorTarget,
      }],
    });

    const replacedPullRequest = LaneProgressStateSchema.parse({
      ...local,
      attempts: local.attempts.map((attempt) => ({
        ...attempt,
        local: attempt.local === undefined
          ? undefined
          : {
              ...attempt.local,
              deliveryAdmission: {
                ...attempt.local.deliveryAdmission!,
                target: { ...attempt.local.deliveryAdmission!.target, pullRequest: 43 },
              },
            },
      })),
    });
    expect(queryEarlierReviewAttempts({
      ...selector(deliveryVehicle(oid("c"))),
      sourceId: "delegated-agent",
    }, {
      status: "complete",
      records: [{ version: 1, state: replacedPullRequest }],
    })).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
  });

  it("retains the exact delegated operation needed to resume earlier findings", async () => {
    const prior = laneState({ delivery: true });
    const local = LaneProgressStateSchema.parse({
      ...prior,
      attempts: [{
        attemptId: "local-review-prior",
        logicalPass: 1,
        retryGeneration: 0,
        changeRequestId: null,
        headSha: oid("a"),
        terminalProducer: true,
        sourceId: "delegated-agent",
        outcome: "findings",
        local: {
          operationId: "local-review-prior",
          requestId: canonicalDigest({ request: "local-review-prior" }),
          vehicle: { kind: "delivery-member", identity: deliveryVehicle(oid("a")).deliverableId },
          target: prior.attempts[0]!.hosted!.reviewTarget,
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          deliveryAdmission: localAdmission(oid("a")),
        },
      }],
    });

    await expect(projectEarlierReviewApplicability({
      query: {
        ...selector(deliveryVehicle(oid("c"))),
        sourceId: "delegated-agent",
      },
      currentBase: oid("2"),
      snapshot: { status: "complete", records: [{ version: 1, state: local }] },
      candidate: candidateRecord(),
      exec: async () => { throw new Error("injected projection must own Git"); },
      observeEndpoints: stableEndpoints,
      projectApplicability: async (applicabilitySelector) => classifyReviewContributionApplicability(
        applicabilitySelector,
        null,
      ),
    })).resolves.toMatchObject({
      status: "complete",
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "findings",
        localResumeAction: { schemaVersion: 1, operationId: "local-review-prior" },
      }],
    });
  });

  it("retains a settled local findings pass at its verified corrected member head", async () => {
    const prior = laneState({ delivery: true });
    const oldTarget = prior.attempts[0]!.hosted!.reviewTarget;
    const local = LaneProgressStateSchema.parse({
      ...prior,
      attempts: [{
        attemptId: "local-review-prior",
        logicalPass: 1,
        retryGeneration: 0,
        changeRequestId: null,
        headSha: oid("a"),
        terminalProducer: true,
        sourceId: "delegated-agent",
        outcome: "settled-findings",
        local: {
          operationId: "local-review-prior",
          requestId: canonicalDigest({ request: "local-review-prior" }),
          vehicle: { kind: "delivery-member", identity: deliveryVehicle(oid("a")).deliverableId },
          target: oldTarget,
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          deliveryAdmission: localAdmission(oid("a")),
        },
      }],
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        producerId: "local-review-prior",
        resultDigest: canonicalDigest({ result: "local-review-prior" }),
        policyVersion: canonicalDigest({ policy: "review" }),
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        proposedBy: "agent-1",
        proposedVerification: "full",
        findings: [{
          findingId: "finding-local",
          sourceIdentity: "delegated-agent",
          locus: "src/example.ts:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-local"],
          reportedSeverity: "major",
          verifiedSeverity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "andrew",
      approvedAt: "2026-09-03T12:00:00Z",
    });
    const fixAuthorization = createFixAuthorization({ dispositionState: approvedDisposition, oldTarget });
    const newTarget = createReviewTarget({
      schemaVersion: oldTarget.schemaVersion,
      semanticsVersion: oldTarget.semanticsVersion,
      kind: oldTarget.kind,
      repositoryId: oldTarget.repositoryId,
      baseRef: oldTarget.baseRef,
      diffBaseSha: oldTarget.diffBaseSha,
      diffBaseTree: oldTarget.diffBaseTree,
      headSha: oid("c"),
      headTree: oid("d"),
    });
    const disposition = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: oldTarget.repositoryId,
      operationId: "local-review-prior",
      candidate: null,
      errand: null,
      deliveryMember: deliveryVehicle(oid("a")),
      source: {
        kind: "attested-local",
        receiptRef: "arc-review-source:v1:attested-local:local-review-prior:receipt%2F1",
        localSourceRef: "git-common:review-gate/local/source.json",
      },
      approvedDisposition,
      fixAuthorization,
      errandFixResponse: null,
      deliveryMemberFixResponse: {
        oldTarget,
        newTarget,
        applicability: "focused",
        fixConsumption: consumeFixAuthorization({
          authorization: fixAuthorization,
          oldTarget,
          newTarget,
          appliedBy: "agent-1",
          consumedAt: "2026-09-03T13:00:00Z",
          verificationRefs: ["verification://focused-fix"],
          priorConsumptions: [],
        }),
        hostedTarget: null,
        hostedFixTarget: null,
      },
    });

    await expect(projectEarlierReviewApplicability({
      query: {
        ...selector(deliveryVehicle(oid("c"))),
        sourceId: "delegated-agent",
      },
      currentBase: newTarget.diffBaseSha,
      snapshot: { status: "complete", records: [{ version: 1, state: local }] },
      candidate: candidateRecord(),
      exec: async () => { throw new Error("verified response should retain without Git projection"); },
      observeEndpoints: stableEndpoints,
      readDispositionRecord: async () => disposition,
    })).resolves.toMatchObject({
      status: "complete",
      attempts: [{
        attemptId: "local-review-prior",
        outcome: "settled-findings",
        applicability: "retain-prior-attempt",
        retentionBasis: "verified-fix-response",
      }],
    });
  });

  it("returns typed unavailability for incomplete, failed, empty, and unbounded snapshots", () => {
    expect(queryEarlierReviewAttempts(selector(), {
      status: "incomplete",
      reason: "malformed-operation-state",
    })).toMatchObject({ status: "unavailable", reason: "operation-snapshot-incomplete" });
    expect(queryEarlierReviewAttempts(selector(), {
      status: "unavailable",
      reason: "operation-snapshot-failed",
    })).toMatchObject({ status: "unavailable", reason: "operation-snapshot-unavailable" });
    expect(queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [],
    })).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
  });

  it("returns multiple exact candidates in stable record and attempt order", () => {
    const prior = laneState();
    const laterState = laneState({ artifactId: "comment-later" });
    const later = {
      ...laterState,
      operationId: "lane-progress/later",
      updatedAt: "2026-08-23T13:00:00Z",
    };
    const result = queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [{ version: 1, state: later }, { version: 2, state: prior }],
    });
    expect(result.status === "complete" && result.candidates.map(({ attemptId }) => attemptId))
      .toEqual([prior.attempts[0]?.attemptId, laterState.attempts[0]?.attemptId]);
  });

  it("projects an exact hosted response plan for an earlier findings attempt", async () => {
    const clean = laneState();
    const findings = LaneProgressStateSchema.parse({
      ...clean,
      attempts: clean.attempts.map((attempt) => {
        const terminal = createHostedTerminalAttemptFixture({
          admission: attempt.hosted!.admission,
          artifact: attempt.hosted!.handle!.artifact,
          outcome: "findings",
          findings: [{
            findingId: "finding-prior",
            origin: "review-thread",
            commentId: "comment-prior",
            threadId: "thread-prior",
            settlement: "reply-and-resolve",
            severity: "major",
            locus: "src/example.ts:1",
            url: "https://example.test/finding-prior",
            sourceOrdinal: 1,
            sourceLabel: "Prior native finding",
          }],
        });
        return {
          ...attempt,
          attemptId: terminal.attemptId,
          outcome: "findings" as const,
          hosted: terminal.hosted,
        };
      }),
    });
    const projected = await projectEarlierReviewApplicability({
      query: selector(),
      currentBase: oid("2"),
      snapshot: { status: "complete", records: [{ version: 1, state: findings }] },
      candidate: candidateRecord(),
      exec: async () => { throw new Error("injected projection must own Git"); },
      observeEndpoints: stableEndpoints,
      projectApplicability: async (applicabilitySelector) => classifyReviewContributionApplicability(
        applicabilitySelector,
        null,
      ),
    });

    expect(projected).toMatchObject({
      status: "complete",
      attempts: [{
        outcome: "findings",
        responsePlan: {
          source: {
            kind: "hosted",
            attemptRef: `arc-review-source:v1:hosted:lane-progress%2Fprior:${encodeURIComponent(
              findings.attempts[0]!.attemptId,
            )}`,
          },
          findings: [{
            findingId: "finding-prior",
            severity: "major",
            locus: "src/example.ts:1",
            evidenceUrlOrId: "https://example.test/finding-prior",
            sourceOrdinal: 1,
            sourceLabel: "Prior native finding",
          }],
        },
      }],
    });
  });

  it("reobserves current endpoints before deriving contribution applicability", async () => {
    await expect(projectEarlierReviewApplicability({
      query: selector(),
      currentBase: oid("2"),
      snapshot: { status: "complete", records: [{ version: 1, state: laneState() }] },
      candidate: candidateRecord(),
      exec: async () => { throw new Error("Git must not run after endpoint movement"); },
      observeEndpoints: async () => ({ head: oid("d"), base: oid("2") }),
    })).resolves.toMatchObject({
      status: "complete",
      attempts: [{
        applicability: "stop",
        projection: { state: "rerun-checkpoint", reason: "head-moved" },
      }],
    });
  });

  it.each([
    {
      name: "unbound selection into a bound member",
      selectionVehicles: null,
      laneVehicle: deliveryVehicle(oid("a")),
      currentVehicle: deliveryVehicle(oid("c")),
      expected: "stop",
    },
    {
      name: "bound selection into an unbound target",
      selectionVehicles: {
        priorVehicle: deliveryVehicle(oid("a")),
        currentVehicle: deliveryVehicle(oid("b")),
      },
      laneVehicle: null,
      currentVehicle: null,
      expected: "stop",
    },
    {
      name: "a different delivery member identity",
      selectionVehicles: {
        priorVehicle: deliveryVehicle(oid("a")),
        currentVehicle: deliveryVehicle(oid("b")),
      },
      laneVehicle: deliveryVehicle(oid("a"), "member-b"),
      currentVehicle: deliveryVehicle(oid("c"), "member-b"),
      expected: "stop",
    },
    {
      name: "the same delivery member identity",
      selectionVehicles: {
        priorVehicle: deliveryVehicle(oid("a")),
        currentVehicle: deliveryVehicle(oid("b")),
      },
      laneVehicle: deliveryVehicle(oid("a")),
      currentVehicle: deliveryVehicle(oid("c")),
      expected: "retain-prior-attempt",
    },
  ])("preserves vehicle scope while mechanically carrying $name", async ({
    selectionVehicles,
    laneVehicle,
    currentVehicle,
    expected,
  }) => {
    const state = laneVehicle === null ? laneState() : laneState({ vehicle: laneVehicle });
    const priorAttemptId = state.attempts[0]!.attemptId;
    const selectedProjection = applicabilityDecision({
      schemaVersion: 1,
      repositoryId: "repository-1",
      repository: "owner/repository",
      pullRequest: 42,
      lane: "standard",
      sourceId: "codex-pr",
      priorAttemptId,
      priorHead: oid("a"),
      currentHead: oid("b"),
      priorBase: oid("1"),
      currentBase: oid("2"),
      ...(selectionVehicles ?? {}),
    });
    if (selectedProjection.state !== "decision-required") throw new Error("expected selection decision");
    const selection: CandidateLineageTransitionV1 = {
      transitionKind: "review-applicability-selection",
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      candidateId: candidateRecord().attestation.candidateId,
      selector: selectedProjection.selector,
      projectionDigest: selectedProjection.projectionDigest,
      residualDigest: selectedProjection.residualDigest,
      selectedBy: "andrew",
      selectedAt: "2026-08-23T12:00:00.000Z",
      choice: "covered",
    };
    const result = await projectEarlierReviewApplicability({
      query: {
        ...selector(currentVehicle ?? undefined),
      },
      currentBase: oid("7"),
      snapshot: { status: "complete", records: [{ version: 1, state }] },
      candidate: candidateRecord([selection]),
      exec: async () => { throw new Error("injected projection must own Git"); },
      observeEndpoints: stableEndpoints,
      projectApplicability: async (projectedSelector) => projectedSelector.priorHead === oid("b")
        ? mechanicalApplicability(projectedSelector)
        : applicabilityDecision(projectedSelector),
    });
    expect(result).toMatchObject({
      status: "complete",
      attempts: [{ applicability: expected }],
    });
  });

  it("composes the exact query, factual projection, and Candidate selection for both consumers", async () => {
    const query = { ...selector(), repository: "Owner/Repository" };
    const state = laneState();
    const snapshot = { status: "complete" as const, records: [{ version: 1, state }] };
    const projectedSelector = {
      schemaVersion: 1 as const,
      repositoryId: query.repositoryId,
      repository: query.repository.toLowerCase(),
      pullRequest: query.pullRequest,
      lane: "standard" as const,
      sourceId: query.sourceId,
      priorAttemptId: state.attempts[0]!.attemptId,
      priorHead: oid("a"),
      currentHead: oid("c"),
      priorBase: oid("1"),
      currentBase: oid("2"),
    };
    const decision = classifyReviewContributionApplicability(projectedSelector, {
      endpoints: {
        before: {
          predecessor: { head: oid("1"), tree: oid("3") },
          member: { head: oid("a"), tree: oid("4") },
        },
        after: {
          predecessor: { head: oid("2"), tree: oid("5") },
          member: { head: oid("c"), tree: oid("6") },
        },
      },
      proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
    });
    if (decision.state !== "decision-required") throw new Error("expected exact residual decision");
    const projectDecision = (
      applicabilitySelector: Parameters<typeof classifyReviewContributionApplicability>[0],
    ) => {
      expect(applicabilitySelector).toEqual(projectedSelector);
      return Promise.resolve(decision);
    };
    const baseInput = {
      query,
      currentBase: oid("2"),
      snapshot,
      exec: async () => { throw new Error("injected projection must own Git"); },
      observeEndpoints: stableEndpoints,
      projectApplicability: projectDecision,
    };
    await expect(projectEarlierReviewApplicability({
      ...baseInput,
      candidate: candidateRecord(),
    })).resolves.toMatchObject({
      status: "complete",
      attempts: [{ sourceId: "codex-pr", outcome: "clean", applicability: "stop" }],
    });
    const selected = (choice: "covered" | "review-required"): CandidateLineageTransitionV1 => ({
      transitionKind: "review-applicability-selection",
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      candidateId: candidateRecord().attestation.candidateId,
      selector: decision.selector,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
      selectedBy: "andrew",
      selectedAt: "2026-08-23T12:00:00.000Z",
      choice,
    });
    const coveredCandidate = candidateRecord([selected("covered")]);
    await expect(projectEarlierReviewApplicability({
      ...baseInput,
      candidate: coveredCandidate,
    })).resolves.toMatchObject({ attempts: [{ applicability: "retain-prior-attempt" }] });
    expect(candidateExpectsEarlierReviewAttempt(coveredCandidate, query)).toBe(true);
    await expect(projectEarlierReviewApplicability({
      ...baseInput,
      snapshot: { status: "complete", records: [] },
      candidate: coveredCandidate,
    })).resolves.toEqual({ status: "not-found" });
    await expect(projectEarlierReviewApplicability({
      ...baseInput,
      candidate: candidateRecord([selected("review-required")]),
    })).resolves.toMatchObject({ attempts: [{ applicability: "request-review" }] });
  });
});

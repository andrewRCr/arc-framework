import { describe, expect, it, vi } from "vitest";

import {
  acknowledgeDeliveryReviewFixVerification,
  advanceDeliveryReviewFixResponse,
  carryDeliveryReviewFixPublicBoundary,
  deriveDeliveryReviewFixLifecycleRevalidation,
  planDeliveryReviewFixRoute,
  publishSelectedDeliveryReviewFix,
  recordDeliveryReviewFixCandidateVerification,
  type DeliveryReviewFixPublicationDependencies,
} from "../../../src/lib/delivery/review-fix.js";
import { canonicalDigest, CanonicalDigestSchema } from "../../../src/lib/kernel/index.js";
import { compareDeliveryLifecycleContribution } from "../../../src/lib/delivery/lifecycle-contribution.js";
import type { DeliveryNativeStackObservation } from "../../../src/lib/delivery/native-stack.js";
import type { DeliveryPositionFactsV1 } from "../../../src/lib/delivery/position.js";
import type { DeliveryRevisionedRecord } from "../../../src/lib/delivery/ports.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import { responsePolicyRequestFixture } from "../../fixtures/review-response-policy.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  createCandidateVerificationResponseEvidence,
  projectCandidateCurrentness,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { projectDeliveryPublicReviewContinuation } from
  "../../../src/lib/delivery/public-review-continuation.js";
import {
  projectCorrectiveDeliveryStatusBoundary,
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { ApprovedDispositionRecordSchema, currentApprovedDispositionNode } from
  "../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../src/scripts/review-gate/core/dispositions.js";
import { createFixAuthorization } from
  "../../../src/scripts/review-gate/core/fix-authorization.js";
import { createReviewTarget } from
  "../../../src/scripts/review-gate/core/gate-contract-v2.js";

function positionFacts(
  state: DeliveryStateV1,
  landedDeliverableIds: DeliveryPositionFactsV1["landedDeliverableIds"] = [],
): DeliveryPositionFactsV1 {
  return { target: state.target, members: state.members, landedDeliverableIds };
}

function terminalAuthoringFacts(state: DeliveryStateV1) {
  const terminal = state.members.at(-1)!;
  return {
    ...positionFacts(state),
    terminalAuthoringMovement: {
      deliverableId: terminal.deliverableId,
      before: terminal.coordinates!,
      after: {
        base: terminal.coordinates!.base,
        head: "f".repeat(40),
        tree: "e".repeat(40),
      },
      publicationLeaseHead: "f".repeat(40),
    },
  };
}

function fixture() {
  const plan = deliveryFourMemberStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const state = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(700 + index) },
    })),
  };
  return { plan, state };
}

describe("delivery review-fix routing", () => {
  it("keeps a selected correction's ROADMAP at its chain base after a sibling regenerates main", () => {
    const { state: initial } = fixture();
    const state = { ...initial, target: { ...initial.target!, ref: "refs/heads/main" } };
    const selected = state.members[1]!;
    const path = ".arc/backlog/ROADMAP.md";
    const lifecycle = deriveDeliveryReviewFixLifecycleRevalidation({
      state,
      selectedDeliverableId: selected.deliverableId,
      candidateRef: "refs/arc/delivery-candidates/selected",
      lifecyclePaths: [path, ".arc/active/meta-delivery-plan-record.md"],
    });
    expect(lifecycle).toEqual({
      protectedBaseRef: "refs/heads/main",
      chainBaseRef: selected.coordinates!.base,
      candidateRef: "refs/arc/delivery-candidates/selected",
      paths: [".arc/active/meta-delivery-plan-record.md", path],
      regenerablePaths: [path],
    });
    if (lifecycle === null) throw new Error("selected member must have lifecycle coordinates");
    const blob = (oid: string) => ({ mode: "100644", type: "blob", oid });
    const protectedBase = new Map([
      [path, blob("sibling-render")],
      [".arc/active/meta-delivery-plan-record.md", blob("unchanged-meta")],
    ]);
    const chainBase = new Map([
      [path, blob("chain-render")],
      [".arc/active/meta-delivery-plan-record.md", blob("unchanged-meta")],
    ]);
    const candidate = new Map(chainBase);
    expect(compareDeliveryLifecycleContribution({
      paths: lifecycle.paths,
      protectedBase,
      chainBase,
      candidate,
      regenerablePaths: lifecycle.regenerablePaths,
    })).toEqual({ status: "match", mismatchedPaths: [] });
    candidate.set(path, blob("competing-render"));
    expect(compareDeliveryLifecycleContribution({
      paths: lifecycle.paths,
      protectedBase,
      chainBase,
      candidate,
      regenerablePaths: lifecycle.regenerablePaths,
    })).toEqual({ status: "mismatch", mismatchedPaths: [path] });
  });

  it("records and exactly replays one verified hosted delivery-member fix response", () => {
    const { plan } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const oldTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "1".repeat(40),
      diffBaseTree: "2".repeat(40),
      headSha: "3".repeat(40),
      headTree: "4".repeat(40),
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        producerId: "operation-member-fix",
        resultDigest: canonicalDigest({ result: "operation-member-fix" }),
        policyVersion: canonicalDigest({ policy: "review" }),
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        proposedBy: "agent-1",
        proposedVerification: "full",
        findings: [{
          findingId: "finding-1",
          sourceIdentity: "codex-pr",
          locus: "src/example.ts:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-1"],
          reportedSeverity: "major",
          verifiedSeverity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-08-31T12:00:00Z",
    });
    const record = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "operation-member-fix",
      candidate: null,
      errand: null,
      deliveryMember: {
        kind: "delivery-member",
        planId: plan.planId,
        deliverableId: selectedDeliverableId,
        workUnitId: plan.workUnitId,
        head: oldTarget.headSha,
      },
      source: {
        kind: "hosted",
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
        hostedResultId: canonicalDigest({ result: "operation-member-fix" }),
      },
      currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({
          headSha: oldTarget.headSha,
          sourceId: "codex-pr",
          reviewOperationId: "operation-member-fix",
        }),
        fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget }),
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    });
    const input = {
      record,
      oldTarget,
      hostedTarget: { repository: "owner/repo", pullRequest: 42, headSha: oldTarget.headSha },
      currentHead: "5".repeat(40),
      currentTree: "6".repeat(40),
      applicability: "full" as const,
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
      verifiedAt: "2026-08-31T13:00:00Z",
    };
    const recorded = advanceDeliveryReviewFixResponse(input);
    expect(recorded).toMatchObject({
      status: "recorded",
      newTarget: { headSha: input.currentHead, headTree: input.currentTree },
      hostedFixTarget: { headSha: input.currentHead },
    });
    if (recorded.status !== "recorded") throw new Error("fix response must record");
    expect(currentApprovedDispositionNode(recorded.record).deliveryMemberFixResponse).toMatchObject({
      applicability: "full",
      fixConsumption: { verificationRefs: input.verificationEvidenceRefs },
    });
    expect(advanceDeliveryReviewFixResponse({
      ...input,
      record: recorded.record,
      verifiedAt: "2026-08-31T14:00:00Z",
    })).toMatchObject({ status: "already-recorded" });
    expect(advanceDeliveryReviewFixResponse({
      ...input,
      record: recorded.record,
      verificationEvidenceRefs: ["criteria://different"],
    })).toEqual({ status: "refused", reason: "review-fix-response-replay-mismatch" });
    expect(advanceDeliveryReviewFixResponse({
      ...input,
      applicability: "focused",
    })).toEqual({ status: "refused", reason: "review-fix-verification-insufficient" });
    expect(advanceDeliveryReviewFixResponse({
      ...input,
      record: recorded.record,
      applicability: "focused",
    })).toEqual({ status: "refused", reason: "review-fix-verification-insufficient" });
  });

  it("records and exactly replays one verified local delivery-member fix response", () => {
    const { plan } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const oldTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "1".repeat(40),
      diffBaseTree: "2".repeat(40),
      headSha: "3".repeat(40),
      headTree: "4".repeat(40),
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        producerId: "local-operation-member-fix",
        resultDigest: canonicalDigest({ result: "local-operation-member-fix" }),
        policyVersion: canonicalDigest({ policy: "review" }),
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        proposedBy: "agent-1",
        proposedVerification: "full",
        findings: [{
          findingId: "finding-1",
          sourceIdentity: "delegated-agent",
          locus: "src/example.ts:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-1"],
          reportedSeverity: "major",
          verifiedSeverity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-08-31T12:00:00Z",
    });
    const record = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "local-operation-member-fix",
      candidate: null,
      errand: null,
      deliveryMember: {
        kind: "delivery-member",
        planId: plan.planId,
        deliverableId: selectedDeliverableId,
        workUnitId: plan.workUnitId,
        head: oldTarget.headSha,
      },
      source: {
        kind: "attested-local",
        receiptRef: "arc-review-source:v1:attested-local:local-operation-member-fix:receipt%2F1",
        localSourceRef: "git-common:review-gate/local/source.json",
      },
      currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({
          headSha: oldTarget.headSha,
          reviewOperationId: "local-operation-member-fix",
        }),
        fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget }),
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    });
    const input = {
      record,
      oldTarget,
      hostedTarget: null,
      currentHead: "5".repeat(40),
      currentTree: "6".repeat(40),
      applicability: "full" as const,
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
      verifiedAt: "2026-08-31T13:00:00Z",
    };

    const recorded = advanceDeliveryReviewFixResponse(input);
    expect(recorded).toMatchObject({
      status: "recorded",
      newTarget: { headSha: input.currentHead, headTree: input.currentTree },
      hostedFixTarget: null,
    });
    if (recorded.status !== "recorded") throw new Error("fix response must record");
    expect(currentApprovedDispositionNode(recorded.record).deliveryMemberFixResponse).toMatchObject({
      applicability: "full",
      hostedTarget: null,
      hostedFixTarget: null,
    });
    expect(advanceDeliveryReviewFixResponse({ ...input, record: recorded.record }))
      .toMatchObject({ status: "already-recorded", hostedFixTarget: null });
  });

  it("carries the same Candidate boundary across the acknowledged state revision", () => {
    const { plan, state } = fixture();
    const before = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 9 });
    if (before.status !== "projected") throw new Error("fixture continuation must project");
    const candidateId = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
    const candidateSubjectDigest = CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`);
    const previousCandidateSubjectDigest = CanonicalDigestSchema.parse(`sha256:${"9".repeat(64)}`);
    const sourceCandidateId = CanonicalDigestSchema.parse(`sha256:${"c".repeat(64)}`);
    const reservation = {
      schemaVersion: 1 as const,
      semanticsVersion: "standard-review-reservation/v1" as const,
      reservationId: CanonicalDigestSchema.parse(`sha256:${"d".repeat(64)}`),
      sources: ["codex-pr"],
      target: {
        kind: "delivery" as const,
        repository: "owner/repo",
        workUnitId: plan.workUnitId,
        planId: plan.planId,
      },
      obligation: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: CanonicalDigestSchema.parse(`sha256:${"e".repeat(64)}`),
        retrigger: "full-final" as const,
        count: 1,
      },
    };
    const publication = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: "feat/example",
      candidateId: sourceCandidateId,
      candidateSubjectDigest: CanonicalDigestSchema.parse(`sha256:${"f".repeat(64)}`),
      reservation,
      changeRequest: null,
    });
    const boundary = projectCorrectiveDeliveryStatusBoundary({
      workUnit: plan.workUnitId,
      candidateId,
      candidateSubjectDigest: previousCandidateSubjectDigest,
      supersedesCandidateId: sourceCandidateId,
      sourceBoundary: publication,
      deliveryContinuation: before.continuation,
    });

    expect(carryDeliveryReviewFixPublicBoundary({
      plan,
      state: { revision: 10, value: state },
      boundary,
      candidateId,
      sourceCandidateSubjectDigest: previousCandidateSubjectDigest,
      candidateSubjectDigest,
    })).toMatchObject({
      status: "carried",
      candidateId,
      stateRevision: 10,
      boundary: {
        candidateId,
        candidateSubjectDigest,
        locus: "delivery-status-required",
        deliveryContinuation: { stateRevision: 10 },
      },
    });
  });

  it("acknowledges one exact pending verification continuation", async () => {
    const { plan, state: initial } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const memberDeliverableIds = [selectedDeliverableId, plan.members[1]!.deliverableId];
    const state: DeliveryStateV1 = {
      ...initial,
      pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
    };
    const current = { revision: 9, value: state };

    const result = await acknowledgeDeliveryReviewFixVerification({
      plan,
      current,
      selectedDeliverableId,
      memberDeliverableIds,
      expectedStateRevision: current.revision,
      continuationDigest: canonicalDigest(current.value),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok",
        value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "acknowledged",
      state: {
        revision: 10,
        value: { pendingReviewFixVerification: null },
      },
      nextAction: "continue-work-unit",
    });
  });

  it("recognizes the exact one-revision acknowledgement replay without another write", async () => {
    const { plan, state: initial } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const memberDeliverableIds = [selectedDeliverableId, plan.members[1]!.deliverableId];
    const before: DeliveryStateV1 = {
      ...initial,
      pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
    };
    const after: DeliveryStateV1 = { ...before, pendingReviewFixVerification: null };

    await expect(acknowledgeDeliveryReviewFixVerification({
      plan,
      current: { revision: 10, value: after },
      selectedDeliverableId,
      memberDeliverableIds,
      expectedStateRevision: 9,
      continuationDigest: canonicalDigest(before),
      stateStore: { publish: async () => { throw new Error("must not write"); } },
    })).resolves.toMatchObject({
      status: "already-acknowledged",
      state: { revision: 10, value: { pendingReviewFixVerification: null } },
      nextAction: "continue-work-unit",
    });
  });

  it("records pending scoped verification before acknowledgement and replays after acknowledgement", () => {
    const { plan, state: initial } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const memberDeliverableIds = [selectedDeliverableId];
    const oldSubject = createCandidateSubjectSnapshot([{
      path: "packages/arc-framework/src/example.ts",
      mode: "100644",
      digest: canonicalDigest({ source: "before" }),
      treatment: "reviewable",
    }]);
    const newSubject = createCandidateSubjectSnapshot([{
      path: "packages/arc-framework/src/example.ts",
      mode: "100644",
      digest: canonicalDigest({ source: "after" }),
      treatment: "reviewable",
    }]);
    const oldHead = "a".repeat(40);
    const newHead = "b".repeat(40);
    const before: DeliveryStateV1 = {
      ...initial,
      members: initial.members.map((member, index, members) => index === members.length - 1
        ? { ...member, coordinates: { ...member.coordinates!, head: newHead } }
        : member),
      pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
    };
    const after: DeliveryStateV1 = { ...before, pendingReviewFixVerification: null };
    const attestation = createCandidateAttestation({
      workUnit: plan.workUnitId,
      subject: oldSubject,
      baseRevision: oldHead,
      attestedBy: "andrew",
      attestedAt: "2026-08-31T12:00:00.000Z",
      verificationEvidenceRef: "tasks://verification",
    });
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation,
      subject: oldSubject,
      transitions: [],
      lineageAttestations: [],
    };
    const currentTarget = { revision: newHead, subject: newSubject };
    const result = recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 9, value: before },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T13:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    });

    expect(result).toMatchObject({
      status: "recorded",
      nextAction: "renew-public-continuation",
      transition: {
        transitionKind: "verification-response",
        authorityRef: canonicalDigest(before),
      },
    });
    if (result.status !== "recorded") throw new Error("expected recorded Candidate verification");
    expect(projectCandidateCurrentness({ record: result.record, current: currentTarget })).toMatchObject({
      status: "current",
      convergenceVerification: "satisfied",
      convergenceScope: null,
    });

    expect(recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 9, value: before },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record: result.record,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T13:30:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    })).toMatchObject({
      status: "already-recorded",
      nextAction: "renew-public-continuation",
    });

    expect(recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 10, value: after },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record: result.record,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T14:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    })).toMatchObject({
      status: "already-recorded",
      nextAction: "renew-public-continuation",
    });

    const wrongAuthorityRecord = {
      ...result.record,
      transitions: [createCandidateVerificationResponseEvidence({
        candidateId: result.transition.candidateId,
        oldTarget: result.transition.oldTarget,
        newTarget: result.transition.newTarget,
        authorityRef: CanonicalDigestSchema.parse(`sha256:${"0".repeat(64)}`),
        verifiedBy: result.transition.verifiedBy,
        verifiedAt: result.transition.verifiedAt,
        applicability: result.transition.applicability,
        verificationEvidenceRefs: result.transition.verificationEvidenceRefs,
        implementationChanged: result.transition.implementationChanged,
      })],
    };
    expect(recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 9, value: before },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record: wrongAuthorityRecord,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T14:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    })).toEqual({
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });
    expect(recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 10, value: after },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record: wrongAuthorityRecord,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T14:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    })).toEqual({
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });

    const trailingWrongAuthorityRecord = {
      ...result.record,
      transitions: [
        ...result.record.transitions,
        createCandidateVerificationResponseEvidence({
          candidateId: result.transition.candidateId,
          oldTarget: result.transition.newTarget,
          newTarget: result.transition.newTarget,
          authorityRef: CanonicalDigestSchema.parse(`sha256:${"0".repeat(64)}`),
          verifiedBy: result.transition.verifiedBy,
          verifiedAt: "2026-08-31T14:05:00.000Z",
          applicability: result.transition.applicability,
          verificationEvidenceRefs: result.transition.verificationEvidenceRefs,
          implementationChanged: false,
        }),
      ],
    };
    expect(recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 9, value: before },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record: trailingWrongAuthorityRecord,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T14:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    })).toEqual({
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });
    expect(recordDeliveryReviewFixCandidateVerification({
      plan,
      state: { revision: 10, value: after },
      acknowledgement: {
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: 9,
        continuationDigest: canonicalDigest(before),
      },
      record: trailingWrongAuthorityRecord,
      committedPredecessorRecord: record,
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T14:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://commit"],
    })).toEqual({
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });
  });

  it("refuses mismatched, intervening, and stale acknowledgement requests", async () => {
    const { plan, state: initial } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const otherDeliverableId = plan.members[1]!.deliverableId;
    const memberDeliverableIds = [selectedDeliverableId, otherDeliverableId];
    const before: DeliveryStateV1 = {
      ...initial,
      pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
    };
    const after: DeliveryStateV1 = { ...before, pendingReviewFixVerification: null };
    const stateStore = { publish: async () => { throw new Error("must not write"); } };

    await expect(acknowledgeDeliveryReviewFixVerification({
      plan,
      current: { revision: 9, value: before },
      selectedDeliverableId: otherDeliverableId,
      memberDeliverableIds,
      expectedStateRevision: 9,
      continuationDigest: canonicalDigest(before),
      stateStore,
    })).resolves.toEqual({ status: "refused", reason: "selected-deliverable-mismatch" });
    await expect(acknowledgeDeliveryReviewFixVerification({
      plan,
      current: { revision: 9, value: before },
      selectedDeliverableId,
      memberDeliverableIds: [selectedDeliverableId],
      expectedStateRevision: 9,
      continuationDigest: canonicalDigest(before),
      stateStore,
    })).resolves.toEqual({ status: "refused", reason: "verification-members-mismatch" });
    await expect(acknowledgeDeliveryReviewFixVerification({
      plan,
      current: { revision: 9, value: before },
      selectedDeliverableId,
      memberDeliverableIds,
      expectedStateRevision: 9,
      continuationDigest: CanonicalDigestSchema.parse(`sha256:${"0".repeat(64)}`),
      stateStore,
    })).resolves.toEqual({ status: "refused", reason: "continuation-mismatch" });
    await expect(acknowledgeDeliveryReviewFixVerification({
      plan,
      current: { revision: 11, value: after },
      selectedDeliverableId,
      memberDeliverableIds,
      expectedStateRevision: 9,
      continuationDigest: canonicalDigest(before),
      stateStore,
    })).resolves.toEqual({ status: "refused", reason: "stale-state" });
  });

  it("routes exact registered and unregistered presentation without guessing", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members[1]!.deliverableId;
    const facts = positionFacts(state, [plan.members[0]!.deliverableId]);

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts,
      selectedDeliverableId,
      observation: { status: "registered", stackNumber: 42 },
      entryMode: "execution",
    })).toMatchObject({
      status: "planned",
      route: "provider-refresh",
      selectedDeliverableId,
      affectedDeliverableIds: plan.members.slice(1, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "publish-selected-member",
      candidateRequirements: {
        requiredAncestorHeads: [
          state.members[1]!.coordinates!.head,
          state.members[0]!.coordinates!.head,
        ],
      },
    });
    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts,
      selectedDeliverableId,
      observation: { status: "unregistered" },
      entryMode: "execution",
    })).toMatchObject({
      status: "planned",
      route: "rematerialize",
      selectedDeliverableId,
      affectedDeliverableIds: plan.members.slice(1, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "rematerialize",
    });
  });

  it("routes a published bound terminal correction to exact terminal rebind", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members.at(-1)!.deliverableId;

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts: terminalAuthoringFacts(state),
      selectedDeliverableId,
      observation: null,
      entryMode: "integrating",
      repository: "owner/repo",
      remote: "origin",
    })).toMatchObject({
      status: "planned",
      route: "terminal-rebind",
      selectedDeliverableId,
      affectedDeliverableIds: [selectedDeliverableId],
      nextAction: "reconcile-terminal-publication",
      reconcileInput: {
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        continuation: "read-position",
      },
    });
  });

  it("keeps a locally authored terminal correction at authoring until its branch is published", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members.at(-1)!.deliverableId;
    const facts = terminalAuthoringFacts(state);

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts: {
        ...facts,
        terminalAuthoringMovement: {
          ...facts.terminalAuthoringMovement,
          publicationLeaseHead: facts.terminalAuthoringMovement.before.head,
        },
      },
      selectedDeliverableId,
      observation: null,
      entryMode: "integrating",
      repository: "owner/repo",
      remote: "origin",
    })).toMatchObject({
      status: "planned",
      route: "terminal-authoring",
      selectedDeliverableId,
      nextAction: "author-terminal",
      recommendedActionText: expect.stringMatching(/commit.*push/iu),
    });
  });

  it("refuses a locally authored terminal correction when its remote branch moved elsewhere", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members.at(-1)!.deliverableId;
    const facts = terminalAuthoringFacts(state);

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts: {
        ...facts,
        terminalAuthoringMovement: {
          ...facts.terminalAuthoringMovement,
          publicationLeaseHead: "d".repeat(40),
        },
      },
      selectedDeliverableId,
      observation: null,
      entryMode: "integrating",
      repository: "owner/repo",
      remote: "origin",
    })).toMatchObject({
      status: "refused",
      reason: "terminal-publication-moved",
    });
  });

  it("keeps an integrating terminal review fix on authoring before publication", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members.at(-1)!.deliverableId;

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts: positionFacts(state),
      selectedDeliverableId,
      observation: null,
      entryMode: "integrating",
      repository: "owner/repo",
      remote: "origin",
    })).toMatchObject({
      status: "planned",
      route: "terminal-authoring",
      selectedDeliverableId,
      nextAction: "author-terminal",
    });
  });

  it("keeps execution-time terminal correction planning on ordinary top authoring", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members.at(-1)!.deliverableId;

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      facts: terminalAuthoringFacts(state),
      selectedDeliverableId,
      observation: null,
      entryMode: "execution",
    })).toMatchObject({
      status: "planned",
      route: "terminal-authoring",
      selectedDeliverableId,
      affectedDeliverableIds: [selectedDeliverableId],
      nextAction: "author-terminal",
    });
  });

  it("refuses every uncertain provider presentation before selecting a mutation model", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const observations: DeliveryNativeStackObservation[] = [
      { status: "partial", affectedDeliverableIds: [selectedDeliverableId] },
      { status: "incoherent", affectedDeliverableIds: [selectedDeliverableId] },
      { status: "unsupported" },
      { status: "unavailable" },
      { status: "malformed" },
      { status: "ambiguous" },
    ];

    for (const observation of observations) {
      expect(planDeliveryReviewFixRoute({
        plan, state, facts: positionFacts(state), selectedDeliverableId, observation,
        entryMode: "execution",
      }))
        .toMatchObject({ status: "refused", reason: `presentation-${observation.status}` });
    }
  });

  it("publishes only one exact descendant candidate and returns the native refresh continuation", async () => {
    const { plan, state } = fixture();
    const selected = state.members[0]!;
    const candidate = { head: "d".repeat(40), tree: "e".repeat(40) };
    const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${plan.members[0]!.chunkKey}`;
    const writes: DeliveryStateV1[] = [];
    const rewriteRef = vi.fn(async () => ({ status: "rewritten" as const }));

    const result = await publishSelectedDeliveryReviewFix({
      plan,
      current: { revision: 7, value: state },
      facts: positionFacts(state),
      selectedDeliverableId: selected.deliverableId,
      candidateRef,
      expectedCandidateRef: candidateRef,
      observation: { status: "registered", stackNumber: 42 },
    }, {
      inspectCandidate: async () => ({ ...candidate, trackedDirty: false }),
      observeCandidateRef: async () => candidate,
      readAncestry: async () => "ancestor",
      revalidateLifecycle: async () => ({ status: "ok" }),
      reobserveAuthority: async () => ({
        status: "observed",
        facts: positionFacts(state),
        observation: { status: "registered", stackNumber: 42 },
      }),
      rewriteRef,
      observePublishedMember: async () => true,
      stateStore: { publish: async (_planId, value, revision) => {
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(rewriteRef).toHaveBeenCalledWith({
      ref: selected.ref,
      beforeHead: selected.coordinates!.head,
      requestedHead: candidate.head,
    });
    expect(writes).toHaveLength(2);
    expect(writes[0]?.activeOperation).toMatchObject({ kind: "rewrite", mode: "selected-change" });
    expect(writes[1]?.members.map(({ coordinates }) => coordinates?.head)).toEqual([
      candidate.head,
      ...state.members.slice(1).map(({ coordinates }) => coordinates?.head),
    ]);
    expect(result).toMatchObject({
      status: "published",
      selectedDeliverableId: selected.deliverableId,
      affectedDeliverableIds: plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "execute-provider-refresh",
    });
  });

  it("recovers a lost selected-publication response from the exact pending refresh seam", async () => {
    const { plan, state: fixtureState } = fixture();
    const state = {
      ...fixtureState,
      members: fixtureState.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0
            ? fixtureState.target!.coordinates!.head
            : fixtureState.members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const selected = state.members[0]!;
    const candidate = { head: "d".repeat(40), tree: "e".repeat(40) };
    const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${plan.members[0]!.chunkKey}`;
    let current: DeliveryRevisionedRecord<DeliveryStateV1> = { revision: 7, value: state };
    const stateStore: DeliveryReviewFixPublicationDependencies["stateStore"] = {
      publish: async (_planId: string, value: DeliveryStateV1, revision: number) => {
        if (revision !== current.revision) {
          return { status: "refused", reason: "version-conflict" };
        }
        current = { revision: revision + 1, value };
        return { status: "ok", value: current };
      },
    };
    const dependencies = {
      inspectCandidate: async () => ({ ...candidate, trackedDirty: false }),
      observeCandidateRef: async () => candidate,
      readAncestry: async () => "ancestor" as const,
      revalidateLifecycle: async () => ({ status: "ok" as const }),
      reobserveAuthority: async () => ({
        status: "observed" as const,
        facts: positionFacts(current.value),
        observation: { status: "registered" as const, stackNumber: 42 },
      }),
      rewriteRef: async () => ({ status: "rewritten" as const }),
      observePublishedMember: async () => true,
      stateStore,
    };
    const request = {
      plan,
      current,
      facts: positionFacts(state),
      selectedDeliverableId: selected.deliverableId,
      candidateRef,
      expectedCandidateRef: candidateRef,
      observation: { status: "registered" as const, stackNumber: 42 },
    };

    await expect(publishSelectedDeliveryReviewFix(request, dependencies)).resolves.toMatchObject({
      status: "published",
      nextAction: "execute-provider-refresh",
    });
    const settledPublication = current;

    await expect(publishSelectedDeliveryReviewFix({
      ...request,
      current: settledPublication,
      facts: positionFacts(settledPublication.value),
    }, {
      ...dependencies,
      rewriteRef: async () => { throw new Error("must not republish the selected member"); },
      stateStore: { publish: async () => { throw new Error("must not rewrite settled publication state"); } },
    })).resolves.toMatchObject({
      status: "published",
      state: settledPublication,
      selectedDeliverableId: selected.deliverableId,
      affectedDeliverableIds: plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "execute-provider-refresh",
    });
    expect(current).toEqual(settledPublication);

    const coherentState = {
      ...settledPublication.value,
      members: settledPublication.value.members.map((member, index, members) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0
            ? settledPublication.value.target!.coordinates!.head
            : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    current = { revision: settledPublication.revision + 1, value: coherentState };
    await expect(publishSelectedDeliveryReviewFix({
      ...request,
      current,
      facts: positionFacts(coherentState),
    }, {
      ...dependencies,
      rewriteRef: async () => { throw new Error("must not republish an unchanged coherent member"); },
      stateStore: { publish: async () => { throw new Error("must not rewrite coherent state"); } },
    })).resolves.toEqual({ status: "refused", reason: "candidate-unchanged" });
  });

  it("routes a changed highest member through the zero-movement refresh executor and refuses unsafe candidate facts", async () => {
    const { plan, state } = fixture();
    const selected = state.members.at(-2)!;
    const candidate = { head: "d".repeat(40), tree: "e".repeat(40) };
    const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${plan.members.at(-2)!.chunkKey}`;
    const common = {
      plan,
      current: { revision: 7, value: state },
      facts: positionFacts(state),
      selectedDeliverableId: selected.deliverableId,
      candidateRef,
      expectedCandidateRef: candidateRef,
      observation: { status: "registered" as const, stackNumber: 42 },
    };
    const dependencies = {
      inspectCandidate: async () => ({ ...candidate, trackedDirty: false }),
      observeCandidateRef: async () => candidate,
      readAncestry: async () => "ancestor" as const,
      revalidateLifecycle: async () => ({ status: "ok" as const }),
      reobserveAuthority: async () => ({
        status: "observed" as const,
        facts: positionFacts(state),
        observation: { status: "registered" as const, stackNumber: 42 },
      }),
      rewriteRef: async () => ({ status: "rewritten" as const }),
      observePublishedMember: async () => true,
      stateStore: { publish: async (_planId: string, value: DeliveryStateV1, revision: number) => ({
        status: "ok" as const, value: { revision: revision + 1, value },
      }) },
    };
    await expect(publishSelectedDeliveryReviewFix(common, dependencies)).resolves.toMatchObject({
      status: "published",
      nextAction: "execute-provider-refresh",
      affectedDeliverableIds: [selected.deliverableId],
    });
    await expect(publishSelectedDeliveryReviewFix(common, {
      ...dependencies,
      inspectCandidate: async () => ({ ...candidate, trackedDirty: true }),
    })).resolves.toEqual({ status: "refused", reason: "candidate-dirty" });
    await expect(publishSelectedDeliveryReviewFix(common, {
      ...dependencies,
      readAncestry: async () => "not-ancestor",
    })).resolves.toEqual({ status: "refused", reason: "candidate-not-descendant" });
    await expect(publishSelectedDeliveryReviewFix(common, {
      ...dependencies,
      revalidateLifecycle: async () => ({ status: "refused" }),
    })).resolves.toEqual({ status: "refused", reason: "lifecycle-contribution" });
  });

  it("refuses a selected candidate that does not include its current non-terminal predecessor", async () => {
    const { plan, state } = fixture();
    const selected = state.members.at(-2)!;
    const predecessor = state.members.at(-3)!;
    const candidate = { head: "d".repeat(40), tree: "e".repeat(40) };
    const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${plan.members.at(-2)!.chunkKey}`;

    await expect(publishSelectedDeliveryReviewFix({
      plan,
      current: { revision: 7, value: state },
      facts: positionFacts(state),
      selectedDeliverableId: selected.deliverableId,
      candidateRef,
      expectedCandidateRef: candidateRef,
      observation: { status: "registered", stackNumber: 42 },
    }, {
      inspectCandidate: async () => ({ ...candidate, trackedDirty: false }),
      observeCandidateRef: async () => candidate,
      readAncestry: async (ancestor) => ancestor === selected.coordinates!.head
        ? "ancestor"
        : ancestor === predecessor.coordinates!.head
          ? "not-ancestor"
          : "unresolvable",
      revalidateLifecycle: async () => { throw new Error("must refuse before lifecycle validation"); },
      reobserveAuthority: async () => { throw new Error("must refuse before authority reobservation"); },
      rewriteRef: async () => { throw new Error("must refuse before publication"); },
      observePublishedMember: async () => { throw new Error("must refuse before publication observation"); },
      stateStore: { publish: async () => { throw new Error("must refuse before reservation"); } },
    })).resolves.toEqual({ status: "refused", reason: "candidate-predecessor-mismatch" });
  });
});

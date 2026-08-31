import { describe, expect, it, vi } from "vitest";

import {
  acknowledgeDeliveryReviewFixVerification,
  planDeliveryReviewFixRoute,
  publishSelectedDeliveryReviewFix,
  recordDeliveryReviewFixCandidateVerification,
  type DeliveryReviewFixPublicationDependencies,
} from "../../../src/lib/delivery/review-fix.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import type { DeliveryNativeStackObservation } from "../../../src/lib/delivery/native-stack.js";
import type { DeliveryRevisionedRecord } from "../../../src/lib/delivery/ports.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  projectCandidateCurrentness,
} from "../../../src/lib/work-unit/candidate-attestation.js";

function positionFacts(state: DeliveryStateV1, landedDeliverableIds: string[] = []) {
  return { target: state.target, members: state.members, landedDeliverableIds };
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
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T13:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
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
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T13:30:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
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
      currentTarget,
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T14:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
    })).toMatchObject({
      status: "already-recorded",
      nextAction: "renew-public-continuation",
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
      continuationDigest: `sha256:${"0".repeat(64)}`,
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
        plan, state, facts: positionFacts(state), selectedDeliverableId, observation, entryMode: "execution",
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

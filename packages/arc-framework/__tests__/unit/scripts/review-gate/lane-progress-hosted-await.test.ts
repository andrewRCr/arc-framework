import { describe, expect, it } from "vitest";

import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { type LaneProgressState, type ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createReviewRequirement, createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";

import { bindHostedAttemptDisposition, captureConditionalNextPassAuthorization, hostedLaneAttemptId, invalidateConditionalNextPassAuthorization, laneProgressOperationId, acknowledgeHostedRequest, recordHostedAwaitAttempt, recordHostedRequestAdmission, recordHostedRequestConclusion, readHostedAwaitReplay, readHostedRequestAdmissionReplay, recordLaneAttempt, recordLaneResponsePerformance, settleLaneAttempt, settleHostedAttemptFinding, supersedeHostedAttemptDisposition } from "../../../../src/scripts/review-gate/lane-progress.js";
import { createHostedAdmission, type HostedRequestEnvelope, type HostedRequestHandle } from "../../../../src/scripts/review-gate/hosted/request.js";


const objectId = (character: string): string => character.repeat(40);
const correctionScope = (headSha: string) => ({
  schemaVersion: 1 as const,
  predecessorProducerId: "prior-review",
  predecessorHeadSha: objectId("9"),
  basisHeadSha: objectId("9"),
  headSha,
  requiredFindings: [],
});
const nativeCoverageEvidence = (headSha: string, status: "established" | "unestablished" = "established") => (
  status === "established"
    ? {
        schemaVersion: 1 as const,
        kind: "provider-native-incremental" as const,
        sourceId: "coderabbit-pr" as const,
        requestArtifactId: "comment-1",
        status,
        baselineSha: objectId("9"),
        headSha,
        providerGeneration: {
          artifactId: "coderabbit-generation-1",
          url: "https://example.invalid/coderabbit-generation-1",
          createdAt: "2026-08-15T10:00:00Z",
          updatedAt: "2026-08-15T11:05:00Z",
          actorIdentity: "136622811" as const,
          appId: "347564" as const,
        },
      }
    : {
        schemaVersion: 1 as const,
        kind: "provider-native-incremental" as const,
        sourceId: "coderabbit-pr" as const,
        requestArtifactId: "comment-1",
        status,
        reason: "provider-incremental-range-mismatch" as const,
      }
);
type LaneAttempt = LaneProgressState["attempts"][number];

function currentAuthorization(attempt: LaneAttempt | undefined) {
  const lineage = attempt?.conditionalPassAuthorizations;
  return lineage?.authorizations.find(({ authorizationId }) =>
    authorizationId === lineage.currentAuthorizationId);
}

function createStore() {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  const store = {
    records,
    drift: 0,
    get state(): ReviewOperationState | null {
      return [...records.values()][0]?.state ?? null;
    },
    readOperation: async (operationId: string) => {
      const record = records.get(operationId);
      return { version: record?.version ?? 0, state: record?.state ?? null };
    },
    publishOperation: async (next: ReviewOperationState, expectedVersion: number) => {
      const current = records.get(next.operationId)?.version ?? 0;
      if (expectedVersion !== current + store.drift) throw new Error("version-conflict");
      const version = current + 1;
      records.set(next.operationId, { version, state: next });
      return { version };
    },
    readOperationSnapshot: async () => ({
      status: "complete" as const,
      records: [...records.values()],
    }),
  };
  return store;
}

const attempt = {
  lane: "standard" as const,
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  headSha: objectId("c"),
  attemptId: "attempt-1",
  sourceId: "coderabbit-pr",
  now: "2026-08-15T12:00:00Z",
};

const handleBase = {
  schemaVersion: 1 as const,
  provider: "coderabbit-pr" as const,
  requestedCoverage: "complete" as const,
  effectiveCoverage: "complete" as const,
  target: { repository: "andrewRCr/arc-framework", pullRequest: 42, headSha: objectId("c") },
  artifact: {
    kind: "issue-comment" as const,
    id: "comment-1",
    url: "https://example.invalid/comment-1",
    createdAt: "2026-08-15T11:00:00Z",
  },
};
const deliveryVehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"9".repeat(64)}`,
  workUnitId: "example",
  head: objectId("c"),
});
const hostedReviewTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const hostedRequirement = createReviewRequirement({
  target: hostedReviewTarget,
  projection: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"e".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
  acceptableSources: [{ sourceKind: "hosted", qualifier: handleBase.provider }],
  initialAdmission: "automatic",
});
if (hostedRequirement === null) throw new Error("expected hosted review requirement");
const hostedContext = {
  reviewTarget: hostedReviewTarget,
  requirement: hostedRequirement,
  actorIdentity: "github-user-1",
  authorizeCapacity: async () => undefined,
};
const hostedAdmission = createHostedAdmission({
  schemaVersion: 1,
  repositoryId: "repo-1",
  lineage: { kind: "candidate", candidateId: `sha256:${"8".repeat(64)}` },
  logicalPass: 1,
  sourceId: handleBase.provider,
  target: handleBase.target,
  requestedCoverage: handleBase.requestedCoverage,
  reviewTarget: hostedReviewTarget,
  requirement: hostedRequirement,
  actorIdentity: hostedContext.actorIdentity,
});
const handle = { ...handleBase, admission: hostedAdmission };
const deliveryHostedReviewTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "delivery-member",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const deliveryHostedRequirement = createReviewRequirement({
  target: deliveryHostedReviewTarget,
  projection: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"e".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
  acceptableSources: [{ sourceKind: "hosted", qualifier: handleBase.provider }],
  initialAdmission: "automatic",
});
if (deliveryHostedRequirement === null) throw new Error("expected delivery hosted review requirement");
const deliveryHostedContext = {
  reviewTarget: deliveryHostedReviewTarget,
  requirement: deliveryHostedRequirement,
  actorIdentity: "github-user-1",
  authorizeCapacity: async () => undefined,
};
const deliveryAdmission = createHostedAdmission({
  schemaVersion: 1,
  repositoryId: "repo-1",
  lineage: {
    kind: "delivery-member",
    planId: deliveryVehicle.planId,
    workUnitId: deliveryVehicle.workUnitId,
    deliverableId: deliveryVehicle.deliverableId,
  },
  logicalPass: 1,
  sourceId: handleBase.provider,
  target: handleBase.target,
  requestedCoverage: handleBase.requestedCoverage,
  vehicle: deliveryVehicle,
  reviewTarget: deliveryHostedReviewTarget,
  requirement: deliveryHostedRequirement,
  actorIdentity: deliveryHostedContext.actorIdentity,
});
const deliveryHandle = { ...handleBase, vehicle: deliveryVehicle, admission: deliveryAdmission };

async function seedAcknowledgedRequest(
  store: ReturnType<typeof createStore>,
  requestHandle: HostedRequestHandle,
) {
  const admission = requestHandle.admission;
  const vehicle: HostedRequestEnvelope["vehicle"] = admission.vehicle?.kind === "errand"
    ? { kind: "errand", standardReview: admission.vehicle.standardReview }
    : admission.vehicle;
  const request: HostedRequestEnvelope = {
    schemaVersion: 1,
    target: admission.target,
    provider: admission.sourceId,
    coverage: admission.requestedCoverage,
    ...(admission.correctionScope === undefined
      ? {}
      : { correctionScope: admission.correctionScope }),
    ...(vehicle === undefined ? {} : { vehicle }),
  };
  const decision = await recordHostedRequestAdmission(store, {
    repositoryId: admission.repositoryId,
    lineage: admission.lineage,
    request,
    ...(admission.vehicle === undefined ? {} : { progressVehicle: admission.vehicle }),
    reviewTarget: admission.reviewTarget,
    requirement: admission.requirement,
    actorIdentity: admission.actorIdentity,
    authorizeCapacity: async () => undefined,
    now: "2026-08-15T11:59:00Z",
  });
  if (decision.state !== "admitted") throw new Error("expected hosted admission");
  return acknowledgeHostedRequest(store, {
    admission: decision.admission,
    handle: requestHandle,
    now: "2026-08-15T11:59:30Z",
  });
}

describe("hosted await lane recording", () => {
  it("allocates and replays a hosted pass after a validated superseded Candidate", async () => {
    const store = createStore();
    const ancestorLineage = { kind: "candidate" as const, candidateId: `sha256:${"7".repeat(64)}` };
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId: "repo-1",
      changeRequestId: "pull/42",
      headSha: objectId("9"),
      lineage: ancestorLineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: "ancestor-standard-review",
      sourceId: "coderabbit-pr",
      outcome: "clean",
      consumedPass: true,
      now: "2026-08-15T11:00:00Z",
    });
    const supersessionAncestors = [{
      candidateId: ancestorLineage.candidateId,
      baseRevision: objectId("a"),
      reviewResponseCount: 0,
    }];
    const request: HostedRequestEnvelope = {
      schemaVersion: 1,
      target: handle.target,
      provider: handle.provider,
      coverage: handle.requestedCoverage,
    };
    let authorizedPass = 0;
    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      supersessionAncestors,
      request,
      ...hostedContext,
      authorizeCapacity: async ({ logicalPass }) => { authorizedPass = logicalPass; },
      now: "2026-08-15T12:00:00Z",
    });
    expect(decision).toMatchObject({ state: "admitted", admission: { logicalPass: 2 } });
    expect(authorizedPass).toBe(2);
    expect(await readHostedRequestAdmissionReplay(store, {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      supersessionAncestors,
      reviewTarget: hostedReviewTarget,
      request,
    })).toEqual({ state: "ambiguous-delivery" });
    expect((await store.readOperation(laneProgressOperationId({
      lane: "standard", repositoryId: "repo-1", headSha: handle.target.headSha,
      lineage: ancestorLineage,
    }))).state).toMatchObject({ completedPasses: 1 });
  });

  it("replays only the current Candidate lineage and exact target through a keyed read", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const request: HostedRequestEnvelope = {
      schemaVersion: 1,
      target: handle.target,
      provider: handle.provider,
      coverage: handle.requestedCoverage,
    };
    const readOperation = async (operationId: string) => store.readOperation(operationId);
    const current = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      reviewTarget: hostedReviewTarget,
      request,
    };

    expect(await readHostedRequestAdmissionReplay({ readOperation }, current)).toEqual({
      state: "acknowledged",
      handle,
      action: { schemaVersion: 1, handle },
    });
    expect(await readHostedRequestAdmissionReplay({ readOperation }, {
      ...current,
      lineage: { kind: "candidate", candidateId: `sha256:${"7".repeat(64)}` },
    })).toBeNull();
    expect(await readHostedRequestAdmissionReplay({ readOperation }, {
      ...current,
      reviewTarget: { ...hostedReviewTarget, diffBaseSha: objectId("9") },
    })).toBeNull();
  });

  it("does not replay a concluded request from a different active Errand claim", async () => {
    const store = createStore();
    const oldClaim = { kind: "head-bound" as const, vehicleKind: "errand", vehicleIdentity: "claim-old", headSha: handle.target.headSha };
    const errandVehicle = {
      kind: "errand" as const,
      key: "errand-one",
      claimId: "claim-old",
      branch: "feature",
      sources: [handle.provider],
      standardReview: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set" as const],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final" as const,
        count: 1 as const,
      },
    };
    const request: HostedRequestEnvelope = {
      schemaVersion: 1,
      target: handle.target,
      provider: handle.provider,
      coverage: handle.requestedCoverage,
      vehicle: { kind: "errand", standardReview: errandVehicle.standardReview },
    };
    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: oldClaim,
      request,
      progressVehicle: errandVehicle,
      ...hostedContext,
      now: "2026-08-15T11:59:00Z",
    });
    if (decision.state !== "admitted") throw new Error("expected hosted admission");
    await recordHostedRequestConclusion(store, {
      admission: decision.admission,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "rate-limited",
        nextAction: "try-next-source",
        provider: handle.provider,
        requestedCoverage: handle.requestedCoverage,
        attemptedProviders: [handle.provider],
      },
      now: "2026-08-15T12:00:00Z",
    });

    const replayInput = { repositoryId: "repo-1", lineage: oldClaim, reviewTarget: hostedReviewTarget, request };
    expect((await readHostedRequestAdmissionReplay(store, replayInput))?.state).toBe("concluded");
    expect(await readHostedRequestAdmissionReplay(store, {
      ...replayInput,
      lineage: { ...oldClaim, vehicleIdentity: "claim-new" },
    })).toBeNull();
  });

  it("consumes a bound authorization before returning its named hosted admission", async () => {
    const store = createStore();
    const lineage = hostedAdmission.lineage;
    const dispositionSetId = `sha256:${"6".repeat(64)}`;
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const captured = await captureConditionalNextPassAuthorization(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      authorizedBy: hostedContext.actorIdentity,
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:00:00Z",
    });
    await settleLaneAttempt(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage,
      attemptId: attempt.attemptId,
      dispositionSetId,
      producedHeadSha: handle.target.headSha,
      now: "2026-08-15T12:01:00Z",
    });
    const request: HostedRequestEnvelope = {
      schemaVersion: 1,
      target: handle.target,
      provider: handle.provider,
      coverage: handle.requestedCoverage,
      ceilingOverride: {
        target: handle.target,
        lane: "standard",
        exhaustedPassCount: 1,
        nextPass: 2,
        conditionalPassAuthorizationId: captured.authorizationId,
      },
    };

    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage,
      request,
      reviewTarget: hostedReviewTarget,
      requirement: hostedRequirement,
      actorIdentity: hostedContext.actorIdentity,
      authorizeCapacity: async () => undefined,
      confirmDispositionSetCurrent: async () => true,
      now: "2026-08-15T12:02:00Z",
    });
    expect(decision.state).toBe("admitted");
    const owner = await store.readOperation(laneProgressOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage,
    }));
    expect(owner.state?.kind === "lane-progress"
      ? currentAuthorization(owner.state.attempts[0])
      : null).toMatchObject({
        status: "consumed",
        producedHeadSha: handle.target.headSha,
      });
  });

  it("revalidates capacity after an intervening owner transition before admission", async () => {
    const store = createStore();
    let authorizationAttempts = 0;

    await expect(recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      authorizeCapacity: async ({ logicalPass }: { logicalPass: number }) => {
        authorizationAttempts += 1;
        if (authorizationAttempts === 1) {
          await recordLaneAttempt(store, {
            lane: "standard",
            repositoryId: "repo-1",
            changeRequestId: "pull/42",
            headSha: handle.target.headSha,
            lineage: hostedAdmission.lineage,
            attemptId: "concurrent-terminal-producer",
            sourceId: handle.provider,
            outcome: "clean",
            consumedPass: true,
            chunkSeriesComplete: true,
            now: "2026-08-15T11:59:59Z",
          });
          return;
        }
        if (logicalPass > 1) throw new Error("review pass ceiling requires approval");
      },
      now: "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/ceiling requires approval/u);
    expect(authorizationAttempts).toBe(2);
    expect(store.state).toMatchObject({
      kind: "lane-progress",
      completedPasses: 1,
      attempts: [{ attemptId: "concurrent-terminal-producer" }],
    });
  });

  it("persists an unacknowledged hosted admission in the lineage owner", async () => {
    const store = createStore();
    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    });

    expect(decision).toEqual({ state: "admitted", admission: hostedAdmission });
    expect(store.state).toMatchObject({
      kind: "lane-progress",
      lineage: hostedAdmission.lineage,
      attempts: [{
        attemptId: hostedAdmission.admissionId,
        logicalPass: 1,
        outcome: "pending",
        hosted: { admission: hostedAdmission },
      }],
    });
  });

  it("stops an unacknowledged admission replay as ambiguous delivery", async () => {
    const store = createStore();
    const input = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1 as const,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    };
    await recordHostedRequestAdmission(store, input);

    expect(await recordHostedRequestAdmission(store, {
      ...input,
      now: "2026-08-15T12:01:00Z",
    })).toEqual({ state: "ambiguous-delivery" });
  });

  it("replays the stored await action after acknowledgment without a new admission", async () => {
    const store = createStore();
    const input = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1 as const,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    };
    const decision = await recordHostedRequestAdmission(store, input);
    if (decision.state !== "admitted") throw new Error("expected fresh hosted admission");
    await acknowledgeHostedRequest(store, {
      admission: decision.admission,
      handle,
      now: "2026-08-15T12:01:00Z",
    });

    expect(await recordHostedRequestAdmission(store, {
      ...input,
      now: "2026-08-15T12:02:00Z",
    })).toEqual({
      state: "acknowledged",
      handle,
      action: { schemaVersion: 1, handle },
    });
  });

  it("keeps the acknowledged admission when current policy and actor context change", async () => {
    const store = createStore();
    const input = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1 as const,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    };
    const decision = await recordHostedRequestAdmission(store, input);
    if (decision.state !== "admitted") throw new Error("expected fresh hosted admission");
    await acknowledgeHostedRequest(store, {
      admission: decision.admission,
      handle,
      now: "2026-08-15T12:01:00Z",
    });
    const changedRequirement = createReviewRequirement({
      target: hostedReviewTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v2",
        rubricDigest: `sha256:${"7".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: handle.provider }],
      initialAdmission: "automatic",
    });
    if (changedRequirement === null) throw new Error("expected changed hosted requirement");

    expect(await recordHostedRequestAdmission(store, {
      ...input,
      requirement: changedRequirement,
      actorIdentity: "github-user-2",
      now: "2026-08-15T12:02:00Z",
    })).toEqual({
      state: "acknowledged",
      handle,
      action: { schemaVersion: 1, handle },
    });
  });

  it("durably records safe request-time unavailability for fallback after restart", async () => {
    const store = createStore();
    const request = {
      schemaVersion: 1 as const,
      target: handle.target,
      provider: "coderabbit-pr" as const,
      coverage: "complete" as const,
      vehicle: deliveryVehicle,
    };
    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: deliveryAdmission.lineage,
      request,
      progressVehicle: deliveryVehicle,
      ...deliveryHostedContext,
      now: "2026-08-15T11:59:00Z",
    });
    if (decision.state !== "admitted") throw new Error("expected hosted admission");
    const state = await recordHostedRequestConclusion(store, {
      admission: decision.admission,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "rate-limited",
        nextAction: "try-next-source",
        provider: "coderabbit-pr",
        requestedCoverage: "complete",
        attemptedProviders: ["coderabbit-pr"],
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state.attempts).toEqual([expect.objectContaining({
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
      hosted: expect.objectContaining({ target: handle.target, vehicle: deliveryVehicle }),
    })]);
    expect(state.completedPasses).toBe(0);
  });

  it("refuses changed requested coverage within one hosted logical pass", async () => {
    const store = createStore();
    const requirement = createReviewRequirement({
      target: deliveryHostedReviewTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [
        { sourceKind: "hosted", qualifier: "coderabbit-pr" },
        { sourceKind: "hosted", qualifier: "codex-pr" },
      ],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("expected fallback review requirement");
    const first = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: deliveryAdmission.lineage,
      request: {
        schemaVersion: 1,
        target: handle.target,
        provider: "coderabbit-pr",
        coverage: "incremental",
        correctionScope: correctionScope(handle.target.headSha),
        vehicle: deliveryVehicle,
      },
      progressVehicle: deliveryVehicle,
      reviewTarget: deliveryHostedReviewTarget,
      requirement,
      actorIdentity: "github-user-1",
      authorizeCapacity: async () => undefined,
      now: "2026-08-15T11:59:00Z",
    });
    if (first.state !== "admitted") throw new Error("expected first hosted admission");
    await recordHostedRequestConclusion(store, {
      admission: first.admission,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "rate-limited",
        nextAction: "try-next-source",
        provider: "coderabbit-pr",
        requestedCoverage: "incremental",
        attemptedProviders: ["coderabbit-pr"],
      },
      now: "2026-08-15T12:00:00Z",
    });

    await expect(recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: deliveryAdmission.lineage,
      request: {
        schemaVersion: 1,
        target: handle.target,
        provider: "codex-pr",
        coverage: "complete",
        vehicle: deliveryVehicle,
      },
      progressVehicle: deliveryVehicle,
      reviewTarget: deliveryHostedReviewTarget,
      requirement,
      actorIdentity: "github-user-1",
      authorizeCapacity: async () => undefined,
      now: "2026-08-15T12:01:00Z",
    })).rejects.toThrow(/requested coverage/u);
  });

  it("refuses a request conclusion that has no durable pending admission", async () => {
    const store = createStore();

    await expect(recordHostedRequestConclusion(store, {
      admission: deliveryAdmission,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "rate-limited",
        nextAction: "try-next-source",
        provider: "coderabbit-pr",
        requestedCoverage: "complete",
        attemptedProviders: ["coderabbit-pr"],
      },
      now: "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/unacknowledged pending admission/u);
  });

  it("refuses an await result that has no durable acknowledged request", async () => {
    const store = createStore();

    await expect(recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/acknowledged request/u);
  });

  it("records a concluded hosted attempt against the standard lane", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "rate-limited", nextAction: "try-next-source" },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("standard");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.attempts).toEqual([expect.objectContaining({
      attemptId: expect.any(String),
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
    })]);
    expect(state?.completedPasses).toBe(0);
  });

  it("counts an incremental verdict once while retaining its coverage", async () => {
    const store = createStore();
    const incrementalAdmission = createHostedAdmission({
      schemaVersion: 1,
      repositoryId: deliveryAdmission.repositoryId,
      lineage: deliveryAdmission.lineage,
      logicalPass: deliveryAdmission.logicalPass,
      sourceId: deliveryAdmission.sourceId,
      target: deliveryAdmission.target,
      requestedCoverage: "incremental",
      correctionScope: correctionScope(deliveryAdmission.target.headSha),
      vehicle: deliveryVehicle,
      reviewTarget: deliveryAdmission.reviewTarget,
      requirement: deliveryAdmission.requirement,
      actorIdentity: deliveryAdmission.actorIdentity,
    });
    const incrementalHandle = {
      ...deliveryHandle,
      requestedCoverage: "incremental" as const,
      effectiveCoverage: "incremental" as const,
      admission: incrementalAdmission,
    };
    await seedAcknowledgedRequest(store, incrementalHandle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: incrementalHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-incremental",
        coverageEvidence: nativeCoverageEvidence(incrementalHandle.target.headSha),
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state?.completedPasses).toBe(1);
    expect(state?.attempts[0]?.hosted).toMatchObject({
      requestedCoverage: "incremental",
      effectiveCoverage: "incremental",
    });
  });

  it("seals an attributable incremental result while withholding unproved effective coverage", async () => {
    const store = createStore();
    const incremental = createHostedHandleFixture({
      requestedCoverage: "incremental",
      target: deliveryHandle.target,
      vehicle: deliveryVehicle,
      artifact: deliveryHandle.artifact,
      correctionScope: correctionScope(deliveryHandle.target.headSha),
    });
    await seedAcknowledgedRequest(store, incremental);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: incremental,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-unproved-incremental",
        coverageEvidence: nativeCoverageEvidence(
          incremental.target.headSha,
          "unestablished",
        ),
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state.completedPasses).toBe(1);
    expect(state.attempts[0]?.hosted).toMatchObject({
      effectiveCoverage: null,
      sealedResult: {
        outcome: "clean",
        coverageEvidence: {
          status: "unestablished",
          reason: "provider-incremental-range-mismatch",
        },
      },
    });
    await expect(readHostedAwaitReplay(store, incremental)).resolves.toMatchObject({
      result: {
        state: "clean",
        coverageEvidence: {
          status: "unestablished",
          reason: "provider-incremental-range-mismatch",
        },
      },
      hostedResultId: state.attempts[0]?.hosted?.sealedResult?.hostedResultId,
    });
  });

  it("retains a delivery selector on the concluded hosted attempt", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, deliveryHandle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: deliveryHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state?.attempts[0]?.hosted).toMatchObject({ vehicle: deliveryVehicle });
  });

  it("consumes a pass only for a verdict-bearing outcome", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.completedPasses).toBe(1);
  });

  it("retains the acknowledged request handle and advances that same attempt monotonically through await", async () => {
    const store = createStore();
    const requested = await seedAcknowledgedRequest(store, handle);
    const pending = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        action: { schemaVersion: 1, handle },
        state: "pending",
        nextAction: "await",
        elapsedMs: 10,
      },
      now: "2026-08-15T12:01:00Z",
    });
    expect(requested.completedPasses).toBe(0);
    expect(pending).toEqual(requested);
    expect(pending?.attempts).toEqual([expect.objectContaining({
      attemptId: hostedLaneAttemptId(handle),
      outcome: "pending",
      hosted: expect.objectContaining({ handle }),
    })]);

    const concluded = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:02:00Z",
    });
    expect(concluded?.completedPasses).toBe(1);
    expect(concluded?.attempts).toEqual([expect.objectContaining({
      attemptId: hostedLaneAttemptId(handle),
      outcome: "clean",
      hosted: expect.objectContaining({
        handle,
        sealedResult: {
          schemaVersion: 1,
          outcome: "clean",
          reviewUrl: "https://example.invalid/review",
          findings: [],
          hostedResultId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        },
      }),
    })]);
    expect(concluded?.attempts[0]?.hosted).not.toHaveProperty("findings");

    const replay = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:03:00Z",
    });
    expect(replay).toEqual(concluded);
  });

  it("rejects selection added to a caller-supplied await handle after an unselected request", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, deliveryHandle);
    const selectedHandle = {
      ...deliveryHandle,
      invocation: { mode: "force" as const, sourceId: deliveryHandle.provider },
    };

    await expect(recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: selectedHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:01:00Z",
    })).rejects.toThrow("hosted acknowledged request does not match durable progress");
  });

  it("rejects a selected pending await without an admitted selected request", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, deliveryHandle);
    const selectedHandle = {
      ...deliveryHandle,
      invocation: { mode: "force" as const, sourceId: deliveryHandle.provider },
    };

    await expect(recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: selectedHandle,
        action: { schemaVersion: 1, handle: selectedHandle },
        state: "pending",
        nextAction: "await",
        elapsedMs: 10,
      },
      now: "2026-08-15T12:01:00Z",
    })).rejects.toThrow("hosted acknowledged request does not match durable progress");
  });

  it("advances an admitted selected request to a durable clean result", async () => {
    const store = createStore();
    const selectedHandle = {
      ...deliveryHandle,
      invocation: { mode: "force" as const, sourceId: deliveryHandle.provider },
    };
    await seedAcknowledgedRequest(store, selectedHandle);
    const stillPending = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: selectedHandle,
        action: { schemaVersion: 1, handle: selectedHandle },
        state: "pending",
        nextAction: "await",
        elapsedMs: 10,
      },
      now: "2026-08-15T12:00:30Z",
    });
    const concluded = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: selectedHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:01:00Z",
    });

    expect(concluded.attempts).toEqual([expect.objectContaining({
      outcome: "clean",
      hosted: expect.objectContaining({ handle: selectedHandle }),
    })]);
    expect(stillPending.attempts).toEqual([expect.objectContaining({ outcome: "pending" })]);
  });

  it("retains the exact pending handle when unattended waiting requests inspection or extension", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        action: { schemaVersion: 1, handle },
        state: "pending",
        nextAction: "inspect-or-extend",
        ageMs: 900_000,
        attentionAfterMs: 900_000,
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state?.completedPasses).toBe(0);
    expect(state?.attempts).toEqual([expect.objectContaining({
      attemptId: hostedLaneAttemptId(handle),
      outcome: "pending",
      hosted: expect.objectContaining({ handle }),
    })]);
  });

  it("settles only the approved hosted finding set and is idempotent per finding", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const findings = [{
      findingId: "thread-1",
      origin: "review-thread" as const,
      commentId: "comment-1",
      threadId: "thread-1",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "src/index.ts:7",
      url: "https://example.invalid/thread-1",
      sourceOrdinal: 1,
      sourceLabel: "Thread native label",
    }, {
      findingId: "body-1",
      origin: "review-body" as const,
      reviewId: "review-1",
      fingerprint: "body-fingerprint",
      settlement: "not-applicable" as const,
      severity: "minor" as const,
      locus: "pull-request review body",
      url: "https://example.invalid/review-1",
      body: "Body finding",
      sourceOrdinal: 2,
      sourceLabel: "Body native label",
    }];
    const progress = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "findings",
        nextAction: "triage",
        reviewUrl: "https://example.invalid/review",
        findings,
      },
      now: "2026-08-15T12:00:00Z",
    });
    if (progress === null) throw new Error("expected hosted lane progress");
    const attemptId = hostedLaneAttemptId(handle);
    const sealedResult = progress.attempts[0]?.hosted?.sealedResult;
    if (sealedResult === undefined) throw new Error("expected sealed hosted result");
    expect(sealedResult.findings).toEqual(findings);
    const replayedProgress = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "findings",
        nextAction: "triage",
        reviewUrl: "https://example.invalid/review",
        findings,
      },
      now: "2026-08-15T12:00:30Z",
    });
    expect(replayedProgress).toEqual(progress);
    await captureConditionalNextPassAuthorization(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      producerId: attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      authorizedBy: hostedContext.actorIdentity,
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:00:45Z",
    });
    const bound = await bindHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "fix",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:01:00Z",
    });
    expect(bound.attempts[0]).toMatchObject({
      outcome: "findings",
      conditionalPassAuthorizations: {
        authorizations: [expect.objectContaining({ status: "pending" })],
      },
      hosted: {
        sealedResult,
        dispositionSetLineage: [{
          dispositionSetId: `sha256:${"f".repeat(64)}`,
          predecessorDispositionSetId: null,
          successorDispositionSetId: null,
        }],
        settledFindingIds: ["body-1"],
        settlementEvidence: [{
          findingId: "body-1",
          dispositionSetId: `sha256:${"f".repeat(64)}`,
          disposition: "reject",
          channelAction: "record-only",
          performedAt: "2026-08-15T12:01:00Z",
          carriedFromDispositionSetId: null,
        }],
      },
    });
    const ambiguousStore = createStore();
    const ambiguousAttempt = bound.attempts[0];
    if (ambiguousAttempt?.hosted === undefined) throw new Error("expected hosted findings attempt");
    ambiguousStore.records.set(bound.operationId, {
      version: 1,
      state: {
        ...bound,
        attempts: [{
          ...ambiguousAttempt,
          outcome: "settled-findings",
          hosted: {
            ...ambiguousAttempt.hosted,
            settledFindingIds: ["body-1", "thread-1"],
          },
        }],
      },
    });
    await expect(supersedeHostedAttemptDisposition(ambiguousStore, {
      operationId: progress.operationId,
      attemptId,
      predecessorDispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: `sha256:${"2".repeat(64)}`,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "reject",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:01:30Z",
    })).rejects.toMatchObject({
      code: "hosted-settlement-conflict",
      reason: "ambiguous-settlement",
    });
    await expect(bindHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "reject",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:01:30Z",
    })).rejects.toThrow("replay conflicts");
    const performed = await recordLaneResponsePerformance(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:01:30Z",
    });
    expect(performed.attempts[0]).toMatchObject({
      outcome: "findings",
      conditionalPassAuthorizations: {
        authorizations: [expect.objectContaining({
          status: "pending",
        })],
      },
      responsePerformance: {
        producerId: attemptId,
        dispositionSetId: `sha256:${"f".repeat(64)}`,
        originatingHeadSha: handle.target.headSha,
        producedHeadSha: objectId("d"),
        performedAt: "2026-08-15T12:01:30Z",
      },
    });
    const settled = await settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingId: "thread-1",
      disposition: "fix",
      actorIdentity: hostedContext.actorIdentity,
      target: handle.target,
      fixTarget: { ...handle.target, headSha: objectId("d") },
      commentId: "comment-1",
      threadId: "thread-1",
      replyDigest: `sha256:${"1".repeat(64)}`,
      replyId: "reply-1",
      now: "2026-08-15T12:02:00Z",
    });
    expect(settled.attempts[0]).toMatchObject({
      outcome: "settled-findings",
      conditionalPassAuthorizations: {
        authorizations: [expect.objectContaining({
          status: "bound",
          producedHeadSha: objectId("d"),
        })],
      },
      hosted: {
        sealedResult,
        settledFindingIds: ["body-1", "thread-1"],
        settlementEvidence: expect.arrayContaining([expect.objectContaining({
          findingId: "thread-1",
          dispositionSetId: `sha256:${"f".repeat(64)}`,
          disposition: "fix",
          channelAction: "reply-and-resolve",
          actorIdentity: hostedContext.actorIdentity,
          target: handle.target,
          fixTarget: { ...handle.target, headSha: objectId("d") },
          commentId: "comment-1",
          threadId: "thread-1",
          replyDigest: `sha256:${"1".repeat(64)}`,
          replyId: "reply-1",
          performedAt: "2026-08-15T12:02:00Z",
          carriedFromDispositionSetId: null,
        })]),
      },
    });
    await expect(settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingId: "thread-1",
      disposition: "fix",
      actorIdentity: hostedContext.actorIdentity,
      target: handle.target,
      fixTarget: { ...handle.target, headSha: objectId("d") },
      commentId: "comment-1",
      threadId: "thread-1",
      replyDigest: `sha256:${"1".repeat(64)}`,
      replyId: "reply-1",
      now: "2026-08-15T12:03:00Z",
    })).resolves.toEqual(settled);

    const successorSetId = `sha256:${"2".repeat(64)}`;
    await invalidateConditionalNextPassAuthorization(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      producerId: attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: successorSetId,
      now: "2026-08-15T12:03:30Z",
    });
    const superseded = await supersedeHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      predecessorDispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: successorSetId,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "reject",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:04:00Z",
    });
    expect(superseded.carriedFindingIds).toEqual(["body-1"]);
    expect(superseded.reopenedFindingIds).toEqual(["thread-1"]);
    const successorAttempt = superseded.progress.attempts[0];
    expect(successorAttempt?.outcome).toBe("findings");
    expect(successorAttempt?.hosted?.dispositionSetId).toBe(successorSetId);
    expect(successorAttempt?.hosted?.dispositionSetLineage).toMatchObject([{
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      predecessorDispositionSetId: null,
      successorDispositionSetId: successorSetId,
    }, {
      dispositionSetId: successorSetId,
      predecessorDispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: null,
    }]);
    expect(successorAttempt?.hosted?.settledFindingIds).toEqual(["body-1"]);
    expect(successorAttempt?.hosted?.settlementEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        findingId: "body-1",
        dispositionSetId: successorSetId,
        disposition: "reject",
        channelAction: "record-only",
        performedAt: "2026-08-15T12:01:00Z",
        carriedFromDispositionSetId: `sha256:${"f".repeat(64)}`,
      }),
    ]));
    await expect(supersedeHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      predecessorDispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: successorSetId,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "reject",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:05:00Z",
    })).resolves.toEqual(superseded);
    const successorSettled = await settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: successorSetId,
      findingId: "thread-1",
      disposition: "reject",
      actorIdentity: hostedContext.actorIdentity,
      target: handle.target,
      fixTarget: null,
      commentId: "comment-1",
      threadId: "thread-1",
      replyDigest: `sha256:${"4".repeat(64)}`,
      replyId: "reply-2",
      now: "2026-08-15T12:05:30Z",
    });
    await expect(supersedeHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      predecessorDispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: successorSetId,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "reject",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:05:45Z",
    })).resolves.toEqual({
      progress: successorSettled,
      carriedFindingIds: ["body-1"],
      reopenedFindingIds: [],
    });
    await expect(supersedeHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      predecessorDispositionSetId: `sha256:${"f".repeat(64)}`,
      successorDispositionSetId: `sha256:${"3".repeat(64)}`,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "reject",
        channelAction: "reply-and-resolve",
      }, {
        findingId: "body-1",
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:06:00Z",
    })).rejects.toThrow("does not advance the current predecessor");
  });

});

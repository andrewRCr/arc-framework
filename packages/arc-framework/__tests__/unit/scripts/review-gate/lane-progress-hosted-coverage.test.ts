import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { createReviewRequirement, createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { LaneProgressState, ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { HostedRequestEnvelope } from "../../../../src/scripts/review-gate/hosted/request.js";
import { recordHostedRequestAdmission, recordHostedRequestConclusion, recordLaneAttempt } from "../../../../src/scripts/review-gate/lane-progress.js";

const oid = (digit: string) => digit.repeat(40);
const headSha = oid("c");
const vehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"9".repeat(64)}`,
  workUnitId: "example",
  head: headSha,
});
const lineage = {
  kind: "delivery-member" as const,
  planId: vehicle.planId,
  workUnitId: vehicle.workUnitId,
  deliverableId: vehicle.deliverableId,
};
const target = { repository: "andrewRCr/arc-framework", pullRequest: 42, headSha };
const reviewTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "delivery-member",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha,
  headTree: oid("d"),
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
  acceptableSources: [
    { sourceKind: "hosted", qualifier: "coderabbit-pr" },
    { sourceKind: "hosted", qualifier: "codex-pr" },
  ],
  initialAdmission: "automatic",
});
if (requirement === null) throw new Error("expected fallback review requirement");

const firstScope = {
  schemaVersion: 1 as const,
  predecessorProducerId: "prior-review",
  predecessorHeadSha: oid("9"),
  basisHeadSha: oid("9"),
  headSha,
  requiredFindings: [],
};
const changedScope = { ...firstScope, basisHeadSha: oid("8") };

function createStore() {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  return {
    get state(): LaneProgressState | null {
      const state = [...records.values()][0]?.state;
      return state?.kind === "lane-progress" ? state : null;
    },
    readOperation: async (operationId: string) => {
      const record = records.get(operationId);
      return { version: record?.version ?? 0, state: record?.state ?? null };
    },
    publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
      const current = records.get(state.operationId)?.version ?? 0;
      if (current !== expectedVersion) throw new Error("version-conflict");
      const version = current + 1;
      records.set(state.operationId, { version, state });
      return { version };
    },
  };
}

const context = {
  repositoryId: "repo-1",
  lineage,
  progressVehicle: vehicle,
  reviewTarget,
  requirement,
  actorIdentity: "github-user-1",
  authorizeCapacity: async () => undefined,
  now: "2026-08-15T12:01:00Z",
};

function request(provider: "coderabbit-pr" | "codex-pr", correctionScope = firstScope): HostedRequestEnvelope {
  return {
    schemaVersion: 1,
    target,
    provider,
    coverage: "incremental",
    correctionScope,
    vehicle,
  };
}

describe("hosted logical pass coverage admission", () => {
  it("rejects changed hosted fallback scope and admits the repaired source fallback", async () => {
    const store = createStore();
    const first = await recordHostedRequestAdmission(store, {
      ...context,
      request: request("coderabbit-pr"),
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
      ...context,
      request: request("codex-pr", changedScope),
    })).rejects.toThrow(/correction scope.*reuse the exact coverage admission/u);
    expect(store.state?.attempts).toHaveLength(1);

    const repaired = await recordHostedRequestAdmission(store, {
      ...context,
      request: request("codex-pr"),
    });
    expect(repaired).toMatchObject({
      state: "admitted",
      admission: { sourceId: "codex-pr", logicalPass: 1, correctionScope: firstScope },
    });
    expect(store.state?.attempts).toHaveLength(2);
  });

  it("rejects changed local-to-hosted fallback scope and admits the repaired request", async () => {
    const store = createStore();
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId: "repo-1",
      changeRequestId: "pull/42",
      headSha,
      lineage,
      logicalPass: 1,
      attemptId: "local-unavailable",
      sourceId: "delegated-agent",
      outcome: "transient-unavailable",
      consumedPass: false,
      local: {
        operationId: "local-unavailable",
        requestId: `sha256:${"1".repeat(64)}`,
        vehicle: { kind: "delivery-member", identity: vehicle.deliverableId },
        target: reviewTarget,
        requestedCoverage: "incremental",
        correctionScope: firstScope,
        effectiveCoverage: null,
        scopeMode: "whole-target",
      },
      now: "2026-08-15T12:00:00Z",
    });

    await expect(recordHostedRequestAdmission(store, {
      ...context,
      request: request("coderabbit-pr", changedScope),
    })).rejects.toThrow(/correction scope.*reuse the exact coverage admission/u);
    expect(store.state?.attempts).toHaveLength(1);

    const repaired = await recordHostedRequestAdmission(store, {
      ...context,
      request: request("coderabbit-pr"),
    });
    expect(repaired).toMatchObject({ state: "admitted", admission: { logicalPass: 1 } });
    expect(store.state?.attempts).toHaveLength(2);
  });
});

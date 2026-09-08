import { describe, expect, it } from "vitest";

import {
  createHostedAdmission,
  HostedRequestEnvelopeSchema,
  requestHostedReview,
  type HostedProgressVehicle,
  type HostedRequestEnvelope,
  type HostedReviewAdapter,
} from "../../../../../src/scripts/review-gate/hosted/request.js";
import { HostedAwaitEnvelopeSchema } from
  "../../../../../src/scripts/review-gate/hosted/await.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";

const HEAD = "a".repeat(40);
const STANDARD_REVIEW = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set" as const],
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"c".repeat(64)}`,
  retrigger: "full-final" as const,
  count: 1 as const,
};
const ERRAND_BINDING = {
  kind: "errand" as const,
  key: "review-errand",
  claimId: "claim-1",
  branch: "chore/review-errand",
  sources: ["coderabbit-pr", "codex-pr"],
  standardReview: STANDARD_REVIEW,
};
const DELIVERY_MEMBER = {
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"d".repeat(64)}`,
  workUnitId: "example",
  base: "b".repeat(40),
  baseRef: "main",
  headRef: "delivery/plan-1/member-1",
  head: HEAD,
  candidateHead: HEAD,
  isFinalMember: false,
};

function admittedRequest(
  request: HostedRequestEnvelope,
  vehicle: HostedProgressVehicle | undefined,
) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle?.kind === "delivery-member" ? "delivery-member" : "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "b".repeat(40),
    diffBaseTree: "c".repeat(40),
    headSha: request.target.headSha,
    headTree: "d".repeat(40),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: STANDARD_REVIEW,
    acceptableSources: [{ sourceKind: "hosted", qualifier: request.provider }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted requirement");
  return createHostedAdmission({
    schemaVersion: 1,
    repositoryId: "repo-1",
    lineage: vehicle?.kind === "delivery-member"
      ? {
          kind: "delivery-member",
          planId: vehicle.planId,
          workUnitId: vehicle.workUnitId,
          deliverableId: vehicle.deliverableId,
        }
      : vehicle?.kind === "errand"
        ? {
            kind: "head-bound",
            vehicleKind: "errand",
            vehicleIdentity: vehicle.claimId,
            headSha: request.target.headSha,
          }
        : { kind: "candidate", candidateId: `sha256:${"e".repeat(64)}` },
    logicalPass: 1,
    sourceId: request.provider,
    target: request.target,
    requestedCoverage: request.coverage,
    ...(vehicle === undefined ? {} : { vehicle }),
    reviewTarget,
    requirement,
    actorIdentity: "github-user-1",
  });
}

const ADMIT_REQUEST = {
  admitRequest: async (request: HostedRequestEnvelope, vehicle: HostedProgressVehicle | undefined) => (
    { state: "admitted" as const, admission: admittedRequest(request, vehicle) }
  ),
  acknowledgeRequest: async () => undefined,
  concludeRequest: async () => undefined,
};

function adapter(
  request: HostedReviewAdapter["request"],
): HostedReviewAdapter {
  return {
    id: "coderabbit-pr",
    identities: { botUserId: "136622811" },
    request,
  };
}

describe("hosted review request", () => {
  it("returns a deterministic resumable handle for an acknowledged request", async () => {
    const input = {
      schemaVersion: 1,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: HEAD,
      },
      provider: "coderabbit-pr",
      coverage: "complete",
    };
    const requested = adapter(async () => ({
      kind: "created",
      effectiveCoverage: "complete",
      artifact: {
        kind: "issue-comment",
        id: "IC_kwDO123",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }));

    const first = await requestHostedReview(input, { adapters: [requested], ...ADMIT_REQUEST });
    const second = await requestHostedReview(input, { adapters: [requested], ...ADMIT_REQUEST });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "requested",
      nextAction: "await",
      handle: {
        schemaVersion: 1,
        provider: "coderabbit-pr",
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        target: input.target,
        artifact: { id: "IC_kwDO123" },
      },
    });
    if (first.state !== "requested") throw new Error("fixture request must be acknowledged");
    expect(first.action).toEqual({ schemaVersion: 1, handle: first.handle });
    expect(() => HostedAwaitEnvelopeSchema.parse(first.action)).not.toThrow();
  });

  it("does not invoke a singleton provider when durable admission fails", async () => {
    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
    }, {
      adapters: [adapter(async () => {
        throw new Error("provider effect ran");
      })],
      admitRequest: async () => {
        throw new Error("admission write failed");
      },
    })).rejects.toThrow("admission write failed");
  });

  it("does not invoke an Errand provider when durable admission fails", async () => {
    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: { kind: "errand", standardReview: STANDARD_REVIEW },
    }, {
      adapters: [adapter(async () => {
        throw new Error("provider effect ran");
      })],
      errandBinding: ERRAND_BINDING,
      admitRequest: async () => {
        throw new Error("admission write failed");
      },
    })).rejects.toThrow("admission write failed");
  });

  it("does not invoke a delivery-member provider when durable admission fails", async () => {
    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: {
        kind: "delivery-member",
        planId: DELIVERY_MEMBER.planId,
        deliverableId: DELIVERY_MEMBER.deliverableId,
        workUnitId: DELIVERY_MEMBER.workUnitId,
        head: DELIVERY_MEMBER.head,
      },
    }, {
      adapters: [adapter(async () => {
        throw new Error("provider effect ran");
      })],
      deliveryMemberLookup: {
        resolveMemberByHead: async () => ({ status: "resolved", member: DELIVERY_MEMBER }),
      },
      admitDeliveryMemberRequest: async () => undefined,
      admitRequest: async () => {
        throw new Error("admission write failed");
      },
    })).rejects.toThrow("admission write failed");
  });

  it("returns the stored await action for an acknowledged admission replay", async () => {
    const request = {
      schemaVersion: 1 as const,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr" as const,
      coverage: "complete" as const,
    };
    const admission = admittedRequest(request, undefined);
    const handle = {
      schemaVersion: 1 as const,
      provider: request.provider,
      requestedCoverage: request.coverage,
      effectiveCoverage: "complete" as const,
      target: request.target,
      artifact: {
        kind: "issue-comment" as const,
        id: "comment-1",
        url: "https://example.invalid/comment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
      admission,
    };

    expect(await requestHostedReview(request, {
      adapters: [adapter(async () => {
        throw new Error("provider effect ran");
      })],
      admitRequest: async () => ({
        state: "acknowledged",
        handle,
        action: { schemaVersion: 1, handle },
      }),
    })).toMatchObject({ state: "requested", nextAction: "await", handle });
  });

  it("stops an unacknowledged admission replay without redispatch", async () => {
    const request = {
      schemaVersion: 1 as const,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr" as const,
      coverage: "complete" as const,
    };

    expect(await requestHostedReview(request, {
      adapters: [adapter(async () => {
        throw new Error("provider effect ran");
      })],
      admitRequest: async () => ({ state: "ambiguous-delivery" }),
    })).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
  });

  it("carries validated Errand progress authority in the resumable handle", async () => {
    const input = {
      schemaVersion: 1,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: HEAD,
      },
      provider: "coderabbit-pr" as const,
      coverage: "complete" as const,
      vehicle: {
        kind: "errand" as const,
        standardReview: STANDARD_REVIEW,
      },
    };
    const requested = adapter(async () => ({
      kind: "created",
      effectiveCoverage: "complete",
      artifact: {
        kind: "issue-comment",
        id: "IC_kwDO123",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }));

    const result = await requestHostedReview(input, {
      adapters: [requested],
      errandBinding: ERRAND_BINDING,
      ...ADMIT_REQUEST,
    });

    expect(result).toMatchObject({
      state: "requested",
      handle: { vehicle: ERRAND_BINDING },
    });
  });

  it("carries validated delivery-member progress authority in the resumable handle", async () => {
    const input = {
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr" as const,
      coverage: "complete" as const,
      vehicle: {
        kind: "delivery-member" as const,
        planId: DELIVERY_MEMBER.planId,
        deliverableId: DELIVERY_MEMBER.deliverableId,
        workUnitId: DELIVERY_MEMBER.workUnitId,
        head: DELIVERY_MEMBER.head,
      },
    };
    const result = await requestHostedReview(input, {
      adapters: [adapter(async () => ({
        kind: "created",
        effectiveCoverage: "complete",
        artifact: {
          kind: "issue-comment",
          id: "IC_kwDO123",
          url: "https://github.com/owner/repo/pull/42#issuecomment-1",
          createdAt: "2026-07-23T12:00:00.000Z",
        },
      }))],
      deliveryMemberLookup: {
        resolveMemberByHead: async () => ({ status: "resolved", member: DELIVERY_MEMBER }),
      },
      admitDeliveryMemberRequest: async () => undefined,
      ...ADMIT_REQUEST,
    });

    expect(result).toMatchObject({
      state: "requested",
      handle: { target: input.target, vehicle: input.vehicle },
    });
  });

  it("rechecks delivery-member admission before invoking the hosted adapter", async () => {
    let providerCalled = false;
    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: {
        kind: "delivery-member",
        planId: DELIVERY_MEMBER.planId,
        deliverableId: DELIVERY_MEMBER.deliverableId,
        workUnitId: DELIVERY_MEMBER.workUnitId,
        head: DELIVERY_MEMBER.head,
      },
    }, {
      adapters: [adapter(async () => {
        providerCalled = true;
        return { kind: "rate-limited" };
      })],
      deliveryMemberLookup: {
        resolveMemberByHead: async () => ({ status: "resolved", member: DELIVERY_MEMBER }),
      },
      admitDeliveryMemberRequest: async () => {
        throw new Error("review pass ceiling requires approval");
      },
    })).rejects.toThrow(/ceiling requires approval/u);
    expect(providerCalled).toBe(false);
  });

  it("refuses delivery-member capacity when no request-time driver admission is bound", async () => {
    let providerCalled = false;
    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: {
        kind: "delivery-member",
        planId: DELIVERY_MEMBER.planId,
        deliverableId: DELIVERY_MEMBER.deliverableId,
        workUnitId: DELIVERY_MEMBER.workUnitId,
        head: DELIVERY_MEMBER.head,
      },
    }, {
      adapters: [adapter(async () => {
        providerCalled = true;
        return { kind: "rate-limited" };
      })],
      deliveryMemberLookup: {
        resolveMemberByHead: async () => ({ status: "resolved", member: DELIVERY_MEMBER }),
      },
    })).rejects.toThrow(/request-time driver admission/u);
    expect(providerCalled).toBe(false);
  });

  it("rejects a delivery-member request whose exact binding does not match", async () => {
    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: {
        kind: "delivery-member",
        planId: "123e4567-e89b-12d3-a456-426614174001",
        deliverableId: DELIVERY_MEMBER.deliverableId,
        workUnitId: DELIVERY_MEMBER.workUnitId,
        head: HEAD,
      },
    }, {
      adapters: [],
      deliveryMemberLookup: {
        resolveMemberByHead: async () => ({ status: "resolved", member: DELIVERY_MEMBER }),
      },
    })).rejects.toThrow("does not match");
  });

  it("rejects malformed and unsupported-version requests", () => {
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 2,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
    })).toThrow();
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 0, headSha: "short" },
      provider: "coderabbit-pr",
      coverage: "incremental",
    })).toThrow();
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "provider-default",
    })).toThrow();
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(64) },
      provider: "codex-pr",
      coverage: "complete",
    })).toThrow();
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "codex-pr",
      coverage: "complete",
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toThrow(/exact delivery-member vehicle/u);
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: {
        kind: "delivery-member",
        planId: DELIVERY_MEMBER.planId,
        deliverableId: DELIVERY_MEMBER.deliverableId,
        workUnitId: DELIVERY_MEMBER.workUnitId,
        head: DELIVERY_MEMBER.head,
      },
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toThrow(/select the request provider/u);
  });

  it("returns a typed failure when the selected source is unavailable", async () => {
    const result = await requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "incremental",
    }, { adapters: [] });

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "source-unavailable",
      nextAction: "stop",
      provider: "coderabbit-pr",
      requestedCoverage: "incremental",
      attemptedProviders: ["coderabbit-pr"],
    });
  });

  it("distinguishes proven pre-effect unavailability from ambiguous delivery", async () => {
    const base = {
      schemaVersion: 1 as const,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr" as const,
      coverage: "incremental" as const,
    };
    const unavailable = await requestHostedReview(base, {
      adapters: [adapter(async () => ({ kind: "rate-limited" }))],
      ...ADMIT_REQUEST,
    });
    const ambiguous = await requestHostedReview(base, {
      adapters: [adapter(async () => ({ kind: "ambiguous-delivery" }))],
      ...ADMIT_REQUEST,
    });

    expect(unavailable).toMatchObject({ state: "rate-limited", nextAction: "try-next-source" });
    expect(ambiguous).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
  });

  it("rejects an adapter that weakens requested complete coverage", async () => {
    const weakened = adapter(async () => ({
      kind: "created",
      effectiveCoverage: "incremental",
      artifact: {
        kind: "issue-comment",
        id: "IC_kwDO123",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }));

    await expect(requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
      coverage: "complete",
    }, { adapters: [weakened], ...ADMIT_REQUEST })).rejects.toThrow();
  });
});

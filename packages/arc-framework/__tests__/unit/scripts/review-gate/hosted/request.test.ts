import { describe, expect, it } from "vitest";

import {
  HostedRequestEnvelopeSchema,
  requestHostedReview,
  type HostedReviewAdapter,
} from "../../../../../src/scripts/review-gate/hosted/request.js";

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
  isFinalMember: false,
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

    const first = await requestHostedReview(input, { adapters: [requested] });
    const second = await requestHostedReview(input, { adapters: [requested] });

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
    });

    expect(result).toMatchObject({
      state: "requested",
      handle: { target: input.target, vehicle: input.vehicle },
    });
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
    });
    const ambiguous = await requestHostedReview(base, {
      adapters: [adapter(async () => ({ kind: "ambiguous-delivery" }))],
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
    }, { adapters: [weakened] })).rejects.toThrow();
  });
});

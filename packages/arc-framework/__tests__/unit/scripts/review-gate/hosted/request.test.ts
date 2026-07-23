import { describe, expect, it } from "vitest";

import {
  HostedRequestEnvelopeSchema,
  requestHostedReview,
  type HostedReviewAdapter,
} from "../../../../../src/scripts/review-gate/hosted/request.js";

const HEAD = "a".repeat(40);

function adapter(
  request: HostedReviewAdapter["request"],
): HostedReviewAdapter {
  return {
    id: "coderabbit-pr",
    requestCommand: "@coderabbitai full review",
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
    };
    const requested = adapter(async () => ({
      kind: "created",
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
        target: input.target,
        artifact: { id: "IC_kwDO123" },
      },
    });
  });

  it("rejects malformed and unsupported-version requests", () => {
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 2,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
    })).toThrow();
    expect(() => HostedRequestEnvelopeSchema.parse({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 0, headSha: "short" },
      provider: "coderabbit-pr",
    })).toThrow();
  });

  it("returns a typed failure when the selected source is unavailable", async () => {
    const result = await requestHostedReview({
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr",
    }, { adapters: [] });

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "source-unavailable",
      nextAction: "stop",
      provider: "coderabbit-pr",
      attemptedProviders: ["coderabbit-pr"],
    });
  });

  it("distinguishes proven pre-effect unavailability from ambiguous delivery", async () => {
    const base = {
      schemaVersion: 1 as const,
      target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      provider: "coderabbit-pr" as const,
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
});

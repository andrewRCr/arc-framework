import { describe, expect, it } from "vitest";

import {
  resolveHostedAwaitTiming,
} from "../../../../../src/scripts/review-gate/hosted/await-config.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

const handle = createHostedHandleFixture({
  provider: "codex-pr",
  target: {
    repository: "owner/repo",
    pullRequest: 42,
    headSha: "a".repeat(40),
  },
  artifact: {
    kind: "issue-comment",
    id: "comment-1",
    url: "https://github.com/owner/repo/pull/42#issuecomment-1",
    createdAt: "2026-08-21T12:00:00Z",
  },
});

const settings = {
  "review.hosted_await_timeout_seconds": "120",
  "review.hosted_await_initial_poll_interval_seconds": "15",
  "review.hosted_await_attention_after_minutes": "15",
};

describe("hosted await timing", () => {
  it("composes project defaults when the request omits timing", () => {
    expect(resolveHostedAwaitTiming({ schemaVersion: 1, handle }, settings)).toEqual({
      request: {
        schemaVersion: 1,
        handle,
        timeoutMs: 120_000,
        pollIntervalMs: 15_000,
      },
      attentionAfterMs: 900_000,
    });
  });

  it("preserves explicit request timing overrides", () => {
    expect(resolveHostedAwaitTiming({
      schemaVersion: 1,
      handle,
      timeoutSeconds: 90,
      initialPollIntervalSeconds: 10,
      continueAfterAttention: true,
    }, settings)).toMatchObject({
      request: {
        timeoutMs: 90_000,
        pollIntervalMs: 10_000,
        continueAfterAttention: true,
      },
      attentionAfterMs: 900_000,
    });
  });

  it("caps an omitted poll interval to an explicit shorter call window", () => {
    expect(resolveHostedAwaitTiming({
      schemaVersion: 1,
      handle,
      timeoutSeconds: 10,
    }, settings)).toMatchObject({
      request: { timeoutMs: 10_000, pollIntervalMs: 10_000 },
    });
  });

  it("returns a typed invalid-input failure for an incompatible explicit override", () => {
    expect(() => resolveHostedAwaitTiming({
      schemaVersion: 1,
      handle,
      initialPollIntervalSeconds: 20,
    }, {
      ...settings,
      "review.hosted_await_timeout_seconds": "10",
      "review.hosted_await_initial_poll_interval_seconds": "5",
    })).toThrow("initialPollIntervalSeconds must not exceed timeoutSeconds");
    try {
      resolveHostedAwaitTiming({ schemaVersion: 1, handle, initialPollIntervalSeconds: 20 }, {
        ...settings,
        "review.hosted_await_timeout_seconds": "10",
        "review.hosted_await_initial_poll_interval_seconds": "5",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid-input" });
    }
  });
});

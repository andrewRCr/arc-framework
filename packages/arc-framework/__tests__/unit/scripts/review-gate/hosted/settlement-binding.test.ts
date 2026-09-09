import { describe, expect, it } from "vitest";

import {
  explainHostedSettlementBindingMismatch,
} from "../../../../../src/scripts/review-gate/hosted/settlement-binding.js";

const target = {
  repository: "example/repository",
  pullRequest: 17,
  headSha: "a".repeat(40),
};

const request = {
  schemaVersion: 1 as const,
  response: {
    attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
    dispositionSetId: `sha256:${"b".repeat(64)}`,
    findingId: "finding-1",
  },
  target,
  fixTarget: null,
  actorIdentity: "andrewRCr",
  finding: { commentId: "comment-1", threadId: "thread-1" },
  disposition: "defer" as const,
  reply: "Tracked for follow-up.",
};

const binding = {
  dispositionSetId: request.response.dispositionSetId,
  actorIdentity: "44483269",
  target,
  findings: [{
    findingId: "finding-1",
    origin: "review-thread" as const,
    commentId: "comment-1",
    threadId: "thread-1",
  }],
};

describe("explainHostedSettlementBindingMismatch", () => {
  it("identifies the expected provider actor identity", () => {
    expect(explainHostedSettlementBindingMismatch(binding, request)).toBe(
      'actorIdentity differs: expected "44483269", received "andrewRCr"',
    );
  });

  it("returns no diagnostic when every approved-attempt binding matches", () => {
    expect(explainHostedSettlementBindingMismatch(binding, {
      ...request,
      actorIdentity: binding.actorIdentity,
    })).toBeNull();
  });
});

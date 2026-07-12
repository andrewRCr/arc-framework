import { describe, expect, it, vi } from "vitest";

import {
  ingestReviewCommands,
  type ReviewCommandComment,
} from "../../../../../src/scripts/review-gate/core/command-ingestion.js";

const scope = {
  changeSetId: "a".repeat(64),
  policyVersion: "b".repeat(64),
  rubricVersion: "independent-analysis/v1",
};

function comment(overrides: Partial<ReviewCommandComment> = {}): ReviewCommandComment {
  return {
    commentId: 1,
    commentNodeId: "IC_1",
    actor: { login: "alice", expectedActorId: "7" },
    actorNodeId: "U_7",
    body: "/review-gate require analysis inspect this change",
    createdAt: "2026-07-11T20:00:00Z",
    updatedAt: "2026-07-11T20:00:00Z",
    durableRef: "https://github.test/pull/7#issuecomment-1",
    ...overrides,
  };
}

describe("review command ingestion", () => {
  it("authorizes an exact command comment as one durable event", async () => {
    const resolveCapabilities = vi.fn(async () => ({
      schemaVersion: 1 as const,
      actorIdentity: "7",
      permissions: ["write" as const],
    }));

    const result = await ingestReviewCommands({
      comments: [comment({ actor: { login: "alice-renamed", expectedActorId: "7" } })],
      commandContext: {
        knownRequirementIds: ["analysis"],
        knownFindings: [],
        allowedSourceIdentities: ["agent-1"],
      },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities,
    });

    expect(result.accepted).toMatchObject([{
      command: { kind: "require", requirementId: "analysis" },
      actorIdentity: "7",
      durableRef: "https://github.test/pull/7#issuecomment-1",
    }]);
    expect(result.replayedEventIds).toEqual([]);
    expect(result.rejections).toEqual([]);
    expect(resolveCapabilities).toHaveBeenCalledWith({ login: "alice-renamed", expectedActorId: "7" });
  });

  it("treats an exact receipt as a no-op while accepting an edited command version", async () => {
    const resolveCapabilities = vi.fn(async () => ({
      schemaVersion: 1 as const,
      actorIdentity: "7",
      permissions: ["write" as const],
    }));
    const original = comment();
    const base = {
      commandContext: {
        knownRequirementIds: ["analysis"],
        knownFindings: [],
        allowedSourceIdentities: ["agent-1"],
      },
      currentScope: scope,
      expectedScope: scope,
      resolveCapabilities,
    };
    const first = await ingestReviewCommands({ ...base, comments: [original], receiptedEventIds: [] });
    const eventId = first.accepted[0]?.eventId;
    expect(eventId).toBeDefined();
    if (eventId === undefined) throw new Error("expected a command event");

    await expect(ingestReviewCommands({
      ...base,
      comments: [original],
      receiptedEventIds: [eventId],
    })).resolves.toMatchObject({
      accepted: [expect.objectContaining({ eventId })],
      replayedEventIds: [eventId],
    });

    const edited = comment({
      body: "/review-gate require analysis inspect the amended change",
      updatedAt: "2026-07-11T20:01:00Z",
    });
    const later = await ingestReviewCommands({
      ...base,
      comments: [edited],
      receiptedEventIds: [eventId],
    });
    expect(later.accepted[0]).toMatchObject({ command: { reason: "inspect the amended change" } });
    expect(later.accepted[0]?.eventId).not.toBe(eventId);
  });

  it("rejects a lookup whose resolved actor id differs from the comment actor", async () => {
    const result = await ingestReviewCommands({
      comments: [comment()],
      commandContext: { knownRequirementIds: ["analysis"], knownFindings: [], allowedSourceIdentities: [] },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities: async () => ({
        schemaVersion: 1,
        actorIdentity: "8",
        permissions: ["admin"],
      }),
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejections).toMatchObject([{ commentNodeId: "IC_1", code: "identity-mismatch" }]);
  });

  it.each([
    ["require", "/review-gate require analysis inspect", ["triage"], "requires-write"],
    ["waive", "/review-gate waive analysis accepted risk", ["write"], "requires-maintain"],
  ] as const)("enforces the %s permission floor", async (_kind, body, permissions, code) => {
    const result = await ingestReviewCommands({
      comments: [comment({ body })],
      commandContext: { knownRequirementIds: ["analysis"], knownFindings: [], allowedSourceIdentities: [] },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities: async () => ({ schemaVersion: 1, actorIdentity: "7", permissions: [...permissions] }),
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejections).toMatchObject([{ code }]);
  });

  it("rejects stale-scope and cross-source commands without resolving a write", async () => {
    const resolveCapabilities = vi.fn(async () => ({
      schemaVersion: 1 as const,
      actorIdentity: "7",
      permissions: ["admin" as const],
    }));
    const stale = await ingestReviewCommands({
      comments: [comment()],
      commandContext: { knownRequirementIds: ["analysis"], knownFindings: [], allowedSourceIdentities: [] },
      currentScope: { ...scope, changeSetId: "c".repeat(64) },
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities,
    });
    const crossSource = await ingestReviewCommands({
      comments: [comment({ body: "/review-gate dismiss analysis agent-2 finding-1 not applicable" })],
      commandContext: {
        knownRequirementIds: ["analysis"],
        knownFindings: [{ sourceIdentity: "agent-1", findingId: "finding-1" }],
        allowedSourceIdentities: ["agent-1"],
      },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities,
    });

    expect(stale.rejections).toMatchObject([{ code: "stale-scope" }]);
    expect(crossSource.rejections).toMatchObject([{ code: "unknown-finding" }]);
    expect(resolveCapabilities).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed input and unavailable identities before persistence", async () => {
    const resolveCapabilities = vi.fn(async () => {
      throw new Error("lookup unavailable");
    });
    const malformed = await ingestReviewCommands({
      comments: [comment({ body: `/review-gate require analysis ${"x".repeat(1025)}` })],
      commandContext: { knownRequirementIds: ["analysis"], knownFindings: [], allowedSourceIdentities: [] },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities,
    });
    const unknown = await ingestReviewCommands({
      comments: [comment()],
      commandContext: { knownRequirementIds: ["analysis"], knownFindings: [], allowedSourceIdentities: [] },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities,
    });

    expect(malformed.rejections).toMatchObject([{ code: "invalid-reason" }]);
    expect(unknown.rejections).toMatchObject([{ code: "capability-unavailable" }]);
    expect(resolveCapabilities).toHaveBeenCalledTimes(1);
  });

  it("ignores comments whose command prefix only starts similarly", async () => {
    const resolveCapabilities = vi.fn();
    const result = await ingestReviewCommands({
      comments: [comment({ body: "/review-gateway require analysis unrelated" })],
      commandContext: { knownRequirementIds: ["analysis"], knownFindings: [], allowedSourceIdentities: [] },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: [],
      resolveCapabilities,
    });

    expect(result).toEqual({ accepted: [], replayedEventIds: [], rejections: [] });
    expect(resolveCapabilities).not.toHaveBeenCalled();
  });
});

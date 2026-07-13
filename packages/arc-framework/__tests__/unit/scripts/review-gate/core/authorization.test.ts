import { describe, expect, it } from "vitest";

import type { ReviewCommand } from "../../../../../src/scripts/review-gate/core/commands.js";
import {
  authorizeReviewCommand,
  overrideIsCurrent,
} from "../../../../../src/scripts/review-gate/core/authorization.js";

const scope = {
  changeSetId: "a".repeat(64),
  policyVersion: "b".repeat(64),
  rubricVersion: "independent-analysis/v1",
};

const requireCommand: ReviewCommand = {
  kind: "require",
  requirementId: "analysis",
  reason: "request review",
};

describe("review command authorization", () => {
  it.each([
    ["require", "write"],
    ["refresh", "write"],
    ["waive", "maintain"],
  ] as const)("requires %s at %s threshold", (kind, permission) => {
    const command = kind === "refresh"
      ? { kind, requirementId: "analysis", sourceIdentity: "agent-1", coverage: "full", reason: "again" } as const
      : { kind, requirementId: "analysis", reason: "reason" } as const;
    expect(authorizeReviewCommand({
      command,
      capabilities: { schemaVersion: 1, actorIdentity: "actor-1", permissions: [permission] },
      currentScope: scope,
      expectedScope: scope,
    })).toMatchObject({ authorized: true, receipt: { actorIdentity: "actor-1", permission } });
  });

  it("rejects under-privileged or stale command attempts", () => {
    expect(authorizeReviewCommand({
      command: { kind: "waive", requirementId: "analysis", reason: "risk" },
      capabilities: { schemaVersion: 1, actorIdentity: "actor-1", permissions: ["write"] },
      currentScope: scope,
      expectedScope: scope,
    }).authorized).toBe(false);
    expect(authorizeReviewCommand({
      command: requireCommand,
      capabilities: { schemaVersion: 1, actorIdentity: "actor-1", permissions: ["admin"] },
      currentScope: { ...scope, changeSetId: "c".repeat(64) },
      expectedScope: scope,
    }).authorized).toBe(false);
  });

  it("expires overrides when change, policy, or rubric identity changes", () => {
    const authorized = authorizeReviewCommand({
      command: requireCommand,
      capabilities: { schemaVersion: 1, actorIdentity: "actor-1", permissions: ["maintain"] },
      currentScope: scope,
      expectedScope: scope,
    });
    expect(authorized.authorized).toBe(true);
    if (!authorized.authorized) return;
    expect(overrideIsCurrent(authorized.receipt, scope)).toBe(true);
    expect(overrideIsCurrent(authorized.receipt, { ...scope, policyVersion: "d".repeat(64) })).toBe(false);
  });
});

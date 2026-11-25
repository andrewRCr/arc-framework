/** Exact delivery-member required-check qualification. */

import { describe, expect, it } from "vitest";
import { assertSchemaRefuses } from "../../../helpers/schema-assertion.js";

import {
  DeliveryMemberChecksInputSchema,
  DeliveryMemberChecksResultSchema,
  observeDeliveryMemberChecks,
} from "../../../../src/scripts/review-gate/delivery-member-checks.js";
import type {
  RequiredCheck,
  RequiredChecksPort,
} from "../../../../src/scripts/review-gate/checks-await.js";

const headSha = "a".repeat(40);
const member = {
  kind: "delivery-member" as const,
  planId: "123e4567-e89b-42d3-a456-426614174000",
  deliverableId: `sha256:${"b".repeat(64)}`,
  workUnitId: "stacked-example",
  head: headSha,
};
const input = DeliveryMemberChecksInputSchema.parse({
  schemaVersion: 1 as const,
  repository: "owner/repo",
  pullRequest: 42,
  headSha,
  member,
});

function port(checks: RequiredCheck[]): RequiredChecksPort {
  return {
    resolveRepository: async () => "owner/repo",
    readHead: async () => headSha,
    readRequiredChecks: async () => checks,
    readObservedChecks: async () => checks,
  };
}

describe("delivery-member required-check qualification", () => {
  it.each([
    { checks: [], qualification: "not-required" },
    { checks: [{ name: "ci-ok", state: "green" }], qualification: "green" },
  ] as const)("qualifies an exact member when checks are $qualification", async ({ checks, qualification }) => {
    await expect(observeDeliveryMemberChecks(input, {
      port: port([...checks]),
      signal: new AbortController().signal,
    })).resolves.toEqual({
      schemaVersion: 1,
      mode: "delivery-member-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      member,
      state: "qualified",
      nextAction: "complete",
      qualification,
      checks,
    });
  });

  it("reports pending checks with diagnostic failures", async () => {
    const checks = [{ name: "ci-ok", state: "pending" }] satisfies RequiredCheck[];
    await expect(observeDeliveryMemberChecks(input, {
      port: {
        ...port(checks),
        readObservedChecks: async () => [
          ...checks,
          { name: "E2E shard 2", state: "failed" },
        ],
      },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      member,
      state: "pending",
      nextAction: "retry",
      checks,
      diagnosticFailures: [{ name: "E2E shard 2", state: "failed" }],
    });
  });

  it("reports failed checks without collapsing their rows", async () => {
    const checks = [
      { name: "build", state: "green" },
      { name: "test", state: "failed" },
    ] satisfies RequiredCheck[];
    await expect(observeDeliveryMemberChecks(input, {
      port: port(checks),
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ member, state: "failed", nextAction: "stop", checks });
  });

  it("reports a moved pull-request head as stale for the exact member", async () => {
    const actualHeadSha = "c".repeat(40);
    await expect(observeDeliveryMemberChecks(input, {
      port: { ...port([]), readHead: async () => actualHeadSha },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      member,
      state: "stale",
      nextAction: "refresh-target",
      actualHeadSha,
    });
  });

  it("reports provider and repository read failures as unavailable", async () => {
    await expect(observeDeliveryMemberChecks(input, {
      port: { ...port([]), resolveRepository: async () => "other/repo" },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      member,
      state: "unavailable",
      nextAction: "retry",
      cause: "repository-mismatch",
      actualRepository: "other/repo",
    });

    await expect(observeDeliveryMemberChecks(input, {
      port: { ...port([]), readRequiredChecks: async () => { throw new Error("provider unavailable"); } },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      member,
      state: "unavailable",
      nextAction: "retry",
      cause: "provider",
      detail: "Required-check evidence was unavailable: provider unavailable",
    });
  });

  it("rejects a member identity bound to another head", () => {
    assertSchemaRefuses(DeliveryMemberChecksInputSchema, {
      ...input,
      member: { ...member, head: "d".repeat(40) },
    });

    assertSchemaRefuses(DeliveryMemberChecksResultSchema, {
      schemaVersion: 1,
      mode: "delivery-member-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      member: { ...member, head: "d".repeat(40) },
      state: "qualified",
      nextAction: "complete",
      qualification: "green",
      checks: [{ name: "ci-ok", state: "green" }],
    });
  });
});

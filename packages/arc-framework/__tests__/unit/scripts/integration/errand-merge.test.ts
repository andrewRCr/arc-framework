/** Exact-effect Errand merge request and result contracts. */

import { describe, expect, it } from "vitest";

import {
  ErrandMergeRequestSchema,
  ErrandMergeResultSchema,
  validateErrandMergeBinding,
} from "../../../../src/scripts/integration/errand-merge.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const identity = {
  slug: "example",
  claimId: "1234567890abcdef1234567890abcdef",
  branch: "chore/example",
  generation: "errand-v1/example/1234567890abcdef1234567890abcdef",
} as const;
const approvedTarget = {
  repository: "owner/repo",
  pullRequest: 42,
  baseRef: "main",
  headRef: "chore/example",
  headSha: oid("c"),
};
const request = ErrandMergeRequestSchema.parse({
  schemaVersion: 1,
  identity,
  approvedTarget,
  lane: "reviewed",
  mergeMethod: {
    method: "merge",
    policyFingerprint: digest("d"),
  },
});
const coordinates = {
  observedTarget: approvedTarget,
  observedBaseOid: oid("b"),
};
const continuation = {
  kind: "remedy" as const,
  remedy: {
    invariant: "The exact approved effect remains bound.",
    text: "Retry the exact request: `arc errand merge example - --json`.",
    argv: ["arc", "errand", "merge", "example", "-", "--json"],
    stdin: request,
  },
};
const resultBase = {
  schemaVersion: 1 as const,
  mode: "errand-merge" as const,
  identity,
  approvedTarget,
  lane: "reviewed" as const,
};

describe("Errand merge contract", () => {
  it("binds the complete approved merge request", () => {
    expect(ErrandMergeRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    { ...request, identity: { ...identity, generation: "errand-v1/example/ffffffffffffffffffffffffffffffff" } },
    { ...request, approvedTarget: { ...approvedTarget, headRef: "chore/other" } },
    { ...request, lane: "native-auto-merge" },
    { ...request, unapproved: true },
  ])("rejects an unbound identity, target, lane, or field", (invalid) => {
    expect(() => ErrandMergeRequestSchema.parse(invalid)).toThrow();
  });

  it("accepts confirmed success without a native auto-merge arm", () => {
    expect(ErrandMergeResultSchema.parse({
      ...resultBase,
      state: "merged",
      nextAction: "complete",
      providerMergeId: "merge-123",
    })).toMatchObject({ state: "merged", nextAction: "complete" });
  });

  it.each([
    {
      state: "awaiting-checks",
      nextAction: "retry",
      reason: "checks-pending",
      detail: "Required checks are pending.",
      coordinates,
      checks: [{ name: "build", state: "pending" }],
      diagnosticFailures: [],
      continuation,
    },
    {
      state: "applicability-judgment-required",
      nextAction: "assess-applicability",
      reason: "bounded-review-residual",
      detail: "Review applicability needs a bounded residual judgment.",
      coordinates,
      applicability: {
        verdict: "supplemental",
        residual: ["src/index.ts"],
        reason: "bounded-overlap",
        judgmentRequired: true,
      },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "Assess the bounded residual and obtain a fresh exact integration approval.",
      },
    },
    {
      state: "reconcile-base",
      nextAction: "reconcile-base",
      reason: "base-reconcile-required",
      detail: "The current plan requires an ordinary base reconcile.",
      coordinates,
      continuation,
    },
    {
      state: "reconcile-regenerable",
      nextAction: "reconcile-regenerable",
      reason: "regenerable-reconcile-required",
      detail: "The current plan admits only the determinate regenerable reconcile.",
      coordinates,
      continuation,
    },
    {
      state: "conflict",
      nextAction: "stop",
      reason: "substantive-conflict",
      detail: "The exact merge has substantive conflicts.",
      coordinates,
      paths: ["src/index.ts"],
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "No safe automated continuation exists for a substantive conflict.",
      },
    },
    {
      state: "host-pending",
      nextAction: "retry",
      reason: "host-admission-unresolved",
      detail: "Host admission is still computing.",
      coordinates,
      continuation,
    },
    {
      state: "host-refused",
      nextAction: "stop",
      reason: "host-refused",
      detail: "The host refused the exact merge.",
      coordinates,
      continuation,
    },
    {
      state: "invalidated",
      nextAction: "request-approval",
      reason: "target-moved",
      detail: "The approved target moved.",
      coordinates: { ...coordinates, observedTarget: { ...approvedTarget, headSha: oid("f") } },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "Recompose the exact request and obtain fresh approval.",
      },
    },
    {
      state: "merge-outcome-unknown",
      nextAction: "retry",
      reason: "mutation-outcome-unknown",
      detail: "The merge effect could not be confirmed.",
      coordinates,
      mutationDetail: "The mutation timed out.",
      confirmationDetail: "Confirmation was unavailable.",
      continuation,
    },
    {
      state: "operation-failed",
      nextAction: "stop",
      reason: "provider-operation-failed",
      detail: "The provider operation failed before mutation.",
      coordinates,
      continuation,
    },
  ] as const)("accepts a complete $state result", (result) => {
    expect(ErrandMergeResultSchema.parse({ ...resultBase, ...result })).toMatchObject({
      state: result.state,
      nextAction: result.nextAction,
      reason: result.reason,
      detail: result.detail,
      coordinates: result.coordinates,
      continuation: result.continuation,
    });
  });

  it("rejects a native auto-merge outcome", () => {
    expect(() => ErrandMergeResultSchema.parse({
      ...resultBase,
      state: "auto-merge-armed",
      nextAction: "await",
      providerMergeId: null,
    })).toThrow();
  });

  it("invalidates approval when the observed target changes", () => {
    expect(validateErrandMergeBinding(request, {
      identity: request.identity,
      target: { ...approvedTarget, headSha: oid("f") },
      baseOid: oid("b"),
    })).toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "target-moved",
      coordinates: {
        observedTarget: { ...approvedTarget, headSha: oid("f") },
        observedBaseOid: oid("b"),
      },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: expect.stringContaining("fresh approval"),
      },
    });
  });
});

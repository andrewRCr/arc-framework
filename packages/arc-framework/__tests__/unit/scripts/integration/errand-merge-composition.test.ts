/** Shared planner composition for Errand terminal merge evidence. */

import { describe, expect, it } from "vitest";

import { composeErrandFinalPlan } from
  "../../../../src/scripts/integration/errand-merge-composition.js";

const oid = (character: string): string => character.repeat(40);
const target = {
  repository: "owner/repo",
  pullRequest: 42,
  baseRef: "main",
  headRef: "chore/example",
  headSha: oid("c"),
};
const drift = {
  verdict: "clean" as const,
  baseOid: oid("b"),
  movement: "disjoint" as const,
  integrationEvidence: {
    coverage: "complete" as const,
    scannedCommitCount: 1,
    events: [],
    unclassifiedCommitCount: 0,
    truncated: false,
    limitations: [],
  },
  overlap: {
    status: "available" as const,
    substantivePaths: [],
    regenerablePaths: [],
  },
};
const admission = {
  state: "mergeable" as const,
  repository: target.repository,
  changeRequest: target.pullRequest,
  base: oid("b"),
  head: target.headSha,
};

describe("Errand final-plan composition", () => {
  it("carries review clearance and proceeds for exact disjoint evidence", () => {
    expect(composeErrandFinalPlan({
      drift,
      target,
      feasibility: { state: "clean", base: oid("b"), head: target.headSha },
      admission,
    })).toMatchObject({
      status: "available",
      plan: { state: "proceed" },
      reviewApplicability: {
        verdict: "carries",
        residual: null,
        judgmentRequired: false,
      },
    });
  });

  it.each([
    ["complete", { state: "reconcile", nextAction: "reconcile-base" }],
    ["partial", { state: "blocked", reason: "unsafe-reconcile" }],
  ] as const)("admits strict-host reconciliation only with %s integration evidence", (coverage, plan) => {
    expect(composeErrandFinalPlan({
      drift: {
        ...drift,
        verdict: "reconcile",
        movement: "overlapping",
        overlap: {
          status: "available",
          substantivePaths: ["src/index.ts"],
          regenerablePaths: [],
        },
        integrationEvidence: { ...drift.integrationEvidence, coverage },
      },
      target,
      feasibility: { state: "clean", base: oid("b"), head: target.headSha },
      admission: {
        ...admission,
        state: "base-currentness-required",
        detail: "The host requires the current base.",
      },
    })).toMatchObject({
      status: "available",
      plan,
      reviewApplicability: {
        verdict: "supplemental",
        residual: ["src/index.ts"],
        judgmentRequired: true,
      },
    });
  });

  it("preserves the determinate regenerable reconcile arm", () => {
    expect(composeErrandFinalPlan({
      drift: {
        ...drift,
        verdict: "reconcile",
        movement: "overlapping",
        overlap: {
          status: "available",
          substantivePaths: ["src/index.ts"],
          regenerablePaths: [".arc/README.md"],
        },
      },
      target,
      feasibility: {
        state: "regenerable-conflict",
        base: oid("b"),
        head: target.headSha,
        paths: [".arc/README.md"],
      },
      admission,
    })).toMatchObject({
      status: "available",
      plan: { state: "reconcile", nextAction: "reconcile-regenerable" },
    });
  });
});

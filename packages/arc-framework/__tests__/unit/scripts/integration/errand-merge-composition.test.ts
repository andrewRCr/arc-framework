/** Shared planner composition for Errand terminal merge evidence. */

import { describe, expect, it } from "vitest";

import { composeErrandFinalPlan, selectCurrentErrandMergeIdentity } from
  "../../../../src/scripts/integration/errand-merge-composition.js";

const oid = (character: string): string => character.repeat(40);
const markerDigest = `sha256:${"d".repeat(64)}`;
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
  headOid: target.headSha,
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
  it("fails closed when drift analyzed a different local head than the refreshed host target", () => {
    expect(composeErrandFinalPlan({
      drift: { ...drift, headOid: oid("d") },
      target,
      feasibility: { state: "clean", base: oid("b"), head: target.headSha },
      admission,
    })).toMatchObject({
      status: "unavailable",
      baseOid: oid("b"),
      detail: expect.stringContaining(oid("d")),
    });
  });

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

type IdentityFrame = Parameters<typeof selectCurrentErrandMergeIdentity>[0];

function currentErrandFrame(): IdentityFrame {
  const claimId = "a".repeat(32);
  const row: IdentityFrame["roster"][number] = {
    kind: "transient",
    checkout: {
      path: "/repo/repair",
      head: oid("b"),
      branch: "chore/repair",
      detached: false,
      primary: false,
    },
    markerGeneration: markerDigest,
    parentCheckoutPath: "/repo",
    origin: null,
    identity: {
      kind: "errand",
      key: "repair",
      claimId,
      protection: "full",
      branch: "chore/repair",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    },
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: { kind: "errand", key: "repair", claimId },
  };
  return {
    roster: [row],
    entering: { kind: "selected", row },
    identityDiscovery: { kind: "complete", identities: [row.identity!], diagnostics: [] },
  };
}

describe("Errand terminal identity composition", () => {
  it("derives the logical Errand generation from one current claim with a live marker digest", () => {
    expect(selectCurrentErrandMergeIdentity(currentErrandFrame(), "repair")).toEqual({
      slug: "repair",
      claimId: "a".repeat(32),
      branch: "chore/repair",
      generation: `errand-v1/repair/${"a".repeat(32)}`,
    });
  });

  it("refuses a current claim without marker occupancy evidence", () => {
    const frame = currentErrandFrame();
    if (frame.entering.kind !== "selected") throw new Error("fixture must select an entering row");
    const row = { ...frame.entering.row, markerGeneration: null };
    expect(() => selectCurrentErrandMergeIdentity({
      ...frame,
      roster: [row],
      entering: { kind: "selected", row },
    }, "repair")).toThrow("no longer proves the exact current Errand generation");
  });

  it.each(["incomplete", "diagnostic", "duplicate"] as const)(
    "refuses %s shared identity authority before terminal merge",
    (fault) => {
      const frame = currentErrandFrame();
      const row = frame.roster[0]!;
      if (frame.identityDiscovery.kind !== "complete") throw new Error("fixture must have complete discovery");
      const ambiguous: IdentityFrame = {
        ...frame,
        ...(fault === "incomplete"
          ? { identityDiscovery: { kind: "error" as const, stage: "tree" as const, message: "unreadable identity root" } }
          : fault === "diagnostic"
            ? {
                identityDiscovery: {
                  ...frame.identityDiscovery,
                  diagnostics: [{ kind: "malformed" as const, key: "other", message: "bad JSON" }],
                },
              }
            : { roster: [row, { ...row, checkout: {
              ...row.checkout, path: "/repo/other",
            } }] }),
      };
      expect(() => selectCurrentErrandMergeIdentity(ambiguous, "repair")).toThrow(
        fault === "duplicate" ? "claimed by more than one checkout" : "identity basis is incomplete",
      );
    },
  );
});

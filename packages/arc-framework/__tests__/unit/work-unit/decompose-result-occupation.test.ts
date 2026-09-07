import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  occupyDecomposeResult,
  type DecomposeCandidateObservation,
  type DecomposeResultOccupationAdapter,
} from "../../../src/lib/work-unit/decompose-result-occupation.js";
import {
  type ValidatedDecomposePlan,
  v3TopologyDigest,
} from "../../../src/lib/work-unit/decompose-v3-plan.js";
import { createProspectiveTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";

function plan(): ValidatedDecomposePlan {
  const planId = canonicalDigest("plan");
  return {
    planId,
    cutMapDigest: canonicalDigest("cut-map"),
    sourceHead: "source-head",
    expectedBaseHead: "base-head",
    topology: { facts: [{ kind: "none" }], digest: v3TopologyDigest([{ kind: "none" }]) },
    allowedPaths: [".arc/active/meta-member.md"],
    allowedPathsDigest: canonicalDigest([".arc/active/meta-member.md"]),
    prospectiveOverlay: createProspectiveTransitionOverlay({
      origin: "origin",
      sourceBranch: "plan/origin",
      planId,
    }),
    roadmap: null,
    mutations: [],
  };
}

function harness(overrides: Partial<DecomposeResultOccupationAdapter> = {}) {
  let observation: DecomposeCandidateObservation = { branchHead: null, registrations: [] };
  const adapter: DecomposeResultOccupationAdapter = {
    resolveBaseHead: async () => "base-head",
    observeCandidate: async () => observation,
    inspectPartial: async () => ({
      baseHead: "base-head",
      indexClean: true,
      worktreeClean: true,
    }),
    candidatePath: async () => "/repo/worktrees/decompose-origin",
    ensureCandidate: async (request) => {
      observation = {
        branchHead: request.baseHead,
        registrations: [{
          path: request.path,
          candidateBranch: request.branch,
          head: request.baseHead,
          occupied: false,
          markerOwned: true,
        }],
      };
      return { status: "ready", observation };
    },
    ...overrides,
  };
  return {
    adapter,
    setObservation: (value: DecomposeCandidateObservation) => {
      observation = value;
    },
  };
}

describe("decomposition result occupation", () => {
  it("rejects base movement in both protection modes before candidate creation", async () => {
    for (const protection of ["full", "partial"] as const) {
      const { adapter } = harness({ resolveBaseHead: async () => "moved-base" });
      expect(await occupyDecomposeResult(
        { protection, configuredBase: "main", origin: "origin", plan: plan() },
        adapter,
      )).toEqual({ status: "refused", reason: "base-moved" });
    }
  });

  it("accepts only an exact clean partial base projection", async () => {
    const clean = harness();
    expect(await occupyDecomposeResult(
      { protection: "partial", configuredBase: "main", origin: "origin", plan: plan() },
      clean.adapter,
    )).toEqual({ status: "occupied", protection: "partial" });

    const dirty = harness({
      inspectPartial: async () => ({
        baseHead: "base-head",
        indexClean: false,
        worktreeClean: true,
      }),
    });
    expect(await occupyDecomposeResult(
      { protection: "partial", configuredBase: "main", origin: "origin", plan: plan() },
      dirty.adapter,
    )).toEqual({ status: "refused", reason: "partial-projection-dirty" });
  });

  it("creates once and resumes only the exact Git-owned candidate projection", async () => {
    const state = harness();
    const first = await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", origin: "origin", plan: plan() },
      state.adapter,
    );
    expect(first).toEqual({
      status: "occupied",
      protection: "full",
      path: "/repo/worktrees/decompose-origin",
      candidateBranch: "chore/decompose-origin",
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", origin: "origin", plan: plan() },
      state.adapter,
    )).toEqual(first);
  });

  it("preserves a pre-existing unregistered deterministic branch as residue", async () => {
    const state = harness();
    state.setObservation({ branchHead: "foreign-head", registrations: [] });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", origin: "origin", plan: plan() },
      state.adapter,
    )).toEqual({ status: "refused", reason: "branch-exists-unregistered" });
  });

  it("reports a simultaneous same-origin creation collision without recovery authority", async () => {
    const state = harness({
      ensureCandidate: async () => ({ status: "collision", noMutation: true }),
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", origin: "origin", plan: plan() },
      state.adapter,
    )).toEqual({ status: "refused", reason: "concurrent-creation" });
  });

  it("exposes ordinary cleanup facts when creation leaves an owned projection", async () => {
    const state = harness({
      ensureCandidate: async () => ({ status: "collision", noMutation: false }),
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", origin: "origin", plan: plan() },
      state.adapter,
    )).toEqual({
      status: "refused",
      reason: "recovery-required",
      recovery: {
        path: "/repo/worktrees/decompose-origin",
        candidateBranch: "chore/decompose-origin",
      },
    });
  });

  it("refuses duplicate, moved-path, occupied, moved-head, and foreign-marker registrations", async () => {
    const cases: Array<{
      registrations: DecomposeCandidateObservation["registrations"];
      branchHead: string;
      reason: string;
    }> = [
      {
        branchHead: "base-head",
        registrations: [
          {
            path: "/one",
            candidateBranch: "chore/decompose-origin",
            head: "base-head",
            occupied: false,
            markerOwned: true,
          },
          {
            path: "/two",
            candidateBranch: "chore/decompose-origin",
            head: "base-head",
            occupied: false,
            markerOwned: true,
          },
        ],
        reason: "duplicate-registration",
      },
      {
        branchHead: "base-head",
        registrations: [{
          path: "/repo/worktrees/foreign",
          candidateBranch: "chore/decompose-origin",
          head: "base-head",
          occupied: false,
          markerOwned: true,
        }],
        reason: "registered-at-wrong-path",
      },
      {
        branchHead: "base-head",
        registrations: [{
          path: "/repo/worktrees/decompose-origin",
          candidateBranch: "chore/decompose-origin",
          head: "base-head",
          occupied: true,
          markerOwned: true,
        }],
        reason: "occupied-path",
      },
      {
        branchHead: "moved-head",
        registrations: [{
          path: "/repo/worktrees/decompose-origin",
          candidateBranch: "chore/decompose-origin",
          head: "moved-head",
          occupied: false,
          markerOwned: true,
        }],
        reason: "candidate-head-mismatch",
      },
      {
        branchHead: "base-head",
        registrations: [{
          path: "/repo/worktrees/decompose-origin",
          candidateBranch: "chore/decompose-origin",
          head: "base-head",
          occupied: false,
          markerOwned: false,
        }],
        reason: "marker-mismatch",
      },
    ];
    for (const candidate of cases) {
      const state = harness();
      state.setObservation(candidate);
      expect(await occupyDecomposeResult(
        { protection: "full", configuredBase: "main", origin: "origin", plan: plan() },
        state.adapter,
      )).toEqual({ status: "refused", reason: candidate.reason });
    }
  });
});

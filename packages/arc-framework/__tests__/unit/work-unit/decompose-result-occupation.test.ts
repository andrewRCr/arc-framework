import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  occupyDecomposeResult,
  type DecomposeCandidateObservation,
  type DecomposeResultOccupationAdapter,
} from "../../../src/lib/work-unit/decompose-result-occupation.js";
import {
  createDecomposeTransientClaimStore,
  type DecomposeTransientClaimStoreDeps,
} from "../../../src/lib/work-unit/decompose-transient-claim-store.js";
import { decomposeTransientClaimId } from "../../../src/lib/work-unit/decompose-transient-claim.js";
import type { ValidatedDecomposePlan } from "../../../src/lib/work-unit/decompose-v3-plan.js";
import { createProspectiveTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";

function plan(): ValidatedDecomposePlan {
  const planId = canonicalDigest("plan");
  return {
    planId,
    cutMapDigest: canonicalDigest("cut-map"),
    sourceHead: "source-head",
    expectedBaseHead: "base-head",
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

function memoryClaims() {
  const files = new Map<string, string>();
  const tails = new Map<string, Promise<unknown>>();
  const deps: DecomposeTransientClaimStoreDeps = {
    root: "/repo/.git/arc/transient-claims",
    read: async (path) => files.get(path) ?? null,
    list: async (root) => [...files.keys()]
      .filter((path) => path.startsWith(`${root}/`))
      .map((path) => path.slice(root.length + 1)),
    writeAtomic: async (path, value) => {
      files.set(path, value);
    },
    withLock: async (path, operation) => {
      const prior = tails.get(path) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(path, prior.then(() => next));
      await prior;
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
  return createDecomposeTransientClaimStore(deps);
}

function harness(overrides: Partial<DecomposeResultOccupationAdapter> = {}) {
  const claims = memoryClaims();
  let observation: DecomposeCandidateObservation = {
    branchHead: null,
    registrations: [],
  };
  const adapter: DecomposeResultOccupationAdapter = {
    claims,
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
          marker: request.marker,
        }],
      };
      return { status: "ready", observation };
    },
    ...overrides,
  };
  return {
    adapter,
    claims,
    setObservation: (value: DecomposeCandidateObservation) => {
      observation = value;
    },
  };
}

describe("decomposition result occupation", () => {
  it("rejects base movement in both protection modes before creating a claim", async () => {
    for (const protection of ["full", "partial"] as const) {
      const { adapter, claims } = harness({ resolveBaseHead: async () => "moved-base" });
      expect(await occupyDecomposeResult(
        { protection, configuredBase: "main", plan: plan() },
        adapter,
      )).toEqual({ status: "refused", reason: "base-moved" });
      expect((await claims.list()).claims).toEqual([]);
    }
  });

  it("accepts only an exact clean partial base projection", async () => {
    const clean = harness();
    expect(await occupyDecomposeResult(
      { protection: "partial", configuredBase: "main", plan: plan() },
      clean.adapter,
    )).toEqual({
      status: "occupied",
      protection: "partial",
      candidateOwnership: { kind: "not-applicable", protection: "partial" },
    });

    const dirty = harness({
      inspectPartial: async () => ({
        baseHead: "base-head",
        indexClean: false,
        worktreeClean: true,
      }),
    });
    expect(await occupyDecomposeResult(
      { protection: "partial", configuredBase: "main", plan: plan() },
      dirty.adapter,
    )).toEqual({ status: "refused", reason: "partial-projection-dirty" });
  });

  it("creates once and resumes only the exact claimed candidate projection", async () => {
    const state = harness();
    const first = await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      state.adapter,
    );
    expect(first).toMatchObject({
      status: "occupied",
      protection: "full",
      path: "/repo/worktrees/decompose-origin",
      candidateOwnership: {
        kind: "claimed",
        generation: 1,
        candidateBranch: "chore/decompose-origin",
      },
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      state.adapter,
    )).toEqual(first);
  });

  it("leaves no claim when a deterministic branch collision is already visible", async () => {
    const state = harness();
    state.setObservation({
      branchHead: "foreign-head",
      registrations: [],
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      state.adapter,
    )).toEqual({ status: "refused", reason: "branch-exists-unregistered" });
    expect((await state.claims.list()).claims).toEqual([]);
  });

  it("rolls a post-acquire creation collision back to one pathless resumable generation", async () => {
    const state = harness({
      ensureCandidate: async () => ({
        status: "collision",
        noMutation: true,
        absence: {
          registrationAbsent: true,
          markerAbsent: true,
          branchAbsent: true,
          pathAbsent: true,
        },
      }),
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      state.adapter,
    )).toEqual({ status: "refused", reason: "concurrent-creation" });
    const claims = (await state.claims.list()).claims;
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      generation: 1,
      state: { kind: "pending" },
      registration: { kind: "unregistered" },
    });
  });

  it("requires recovery when occupied state loses its candidate or creation cannot prove absence", async () => {
    const lost = harness();
    expect((await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      lost.adapter,
    )).status).toBe("occupied");
    lost.setObservation({ branchHead: null, registrations: [] });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      lost.adapter,
    )).toEqual({ status: "refused", reason: "recovery-required" });

    const unproven = harness({
      ensureCandidate: async () => ({ status: "collision", noMutation: false }),
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      unproven.adapter,
    )).toEqual({ status: "refused", reason: "recovery-required" });
  });

  it("refuses a stale source binding and duplicate or occupied registrations", async () => {
    const stale = harness();
    const staleBinding = {
      origin: "origin",
      candidateBranch: "chore/decompose-origin",
      sourceHead: "stale-source",
      resultBaseHead: "base-head",
      cutMapDigest: plan().cutMapDigest,
    };
    const claimId = decomposeTransientClaimId(staleBinding);
    const acquired = await stale.claims.acquire(claimId, staleBinding);
    if (acquired.status !== "acquired") throw new Error("expected stale claim");
    const path = "/repo/worktrees/decompose-origin";
    await stale.claims.reserve(claimId, 1, path);
    stale.setObservation({
      branchHead: "base-head",
      registrations: [{
        path,
        candidateBranch: staleBinding.candidateBranch,
        head: "base-head",
        occupied: false,
        marker: {
          claimId,
          generation: 1,
          candidateWorktree: acquired.claim.candidateWorktree,
        },
      }],
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      stale.adapter,
    )).toEqual({ status: "refused", reason: "candidate-binding-mismatch" });

    const duplicate = harness();
    duplicate.setObservation({
      branchHead: "base-head",
      registrations: [
        { path: "/one", candidateBranch: "chore/decompose-origin", head: "base-head", occupied: false, marker: null },
        { path: "/two", candidateBranch: "chore/decompose-origin", head: "base-head", occupied: true, marker: null },
      ],
    });
    expect(await occupyDecomposeResult(
      { protection: "full", configuredBase: "main", plan: plan() },
      duplicate.adapter,
    )).toEqual({ status: "refused", reason: "duplicate-registration" });

    for (const [pathOverride, occupied, reason] of [
      ["/repo/worktrees/foreign", false, "registered-at-wrong-path"],
      [path, true, "occupied-path"],
    ] as const) {
      const conflicted = harness();
      const exactBinding = {
        origin: "origin",
        candidateBranch: "chore/decompose-origin",
        sourceHead: "source-head",
        resultBaseHead: "base-head",
        cutMapDigest: plan().cutMapDigest,
      };
      const exactId = decomposeTransientClaimId(exactBinding);
      const exact = await conflicted.claims.acquire(exactId, exactBinding);
      if (exact.status !== "acquired") throw new Error("expected exact claim");
      await conflicted.claims.reserve(exactId, 1, path);
      conflicted.setObservation({
        branchHead: "base-head",
        registrations: [{
          path: pathOverride,
          candidateBranch: exactBinding.candidateBranch,
          head: "base-head",
          occupied,
          marker: {
            claimId: exactId,
            generation: 1,
            candidateWorktree: exact.claim.candidateWorktree,
          },
        }],
      });
      expect(await occupyDecomposeResult(
        { protection: "full", configuredBase: "main", plan: plan() },
        conflicted.adapter,
      )).toEqual({ status: "refused", reason });
    }
  });
});

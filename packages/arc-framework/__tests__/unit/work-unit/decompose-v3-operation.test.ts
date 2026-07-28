import { describe, expect, it } from "vitest";

import { canonicalDigest, digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  executeV3DecomposeOperation,
  type V3DecomposeOperationDependencies,
  type V3PartialPathPreimage,
} from "../../../src/lib/work-unit/decompose-v3-operation.js";
import type {
  DecomposeResultOccupationResult,
} from "../../../src/lib/work-unit/decompose-result-occupation.js";
import type {
  V3PlanCanonicalPathState,
  V3ValidatedPathMutation,
  ValidatedDecomposePlan,
} from "../../../src/lib/work-unit/decompose-v3-plan.js";
import {
  createV3DecomposePreparation,
  v3CandidateWorktreeId,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { createProspectiveTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const encoder = new TextEncoder();
const firstBytes = encoder.encode("first final\n");
const secondBytes = encoder.encode("second final\n");
const firstAfter = {
  kind: "file",
  mode: "100644",
  contentDigest: digestBytes(firstBytes),
} as const;
const secondAfter = {
  kind: "file",
  mode: "100644",
  contentDigest: digestBytes(secondBytes),
} as const;

function operationFixture() {
  const { preparation } = v3DecompositionEvidenceFixture();
  const { facts } = preparation;
  const firstDestination = facts.destinationOutputPaths[0]!;
  const secondDestination = facts.destinationOutputPaths[1]!;
  const firstPath = firstDestination.paths[0]!;
  const secondPath = secondDestination.paths[0]!;
  const mutation = (
    path: string,
    after: V3PlanCanonicalPathState,
    destinationId: string,
  ): V3ValidatedPathMutation => ({
    kind: "composed",
    path,
    before: { kind: "absent" },
    after,
    contributors: [{
      kind: "content",
      destinationId,
      destinationKind: "new-member",
      artifactRole: "meta",
      contributorKind: "scaffold",
      contributorIdentity: `scaffold:${destinationId}`,
      sourceProjection: [],
      disposition: "whole-file",
      before: { kind: "absent" },
      after,
    }],
  });
  const mutations = [
    mutation(firstPath, firstAfter, firstDestination.destinationId),
    mutation(secondPath, secondAfter, secondDestination.destinationId),
  ];
  const plan: ValidatedDecomposePlan = {
    planId: facts.prospectiveProjection.overlay.planId,
    cutMapDigest: facts.cutMapDigest,
    sourceHead: facts.completedMap.machine.source.head,
    expectedBaseHead: facts.completedMap.machine.resultBase.head,
    candidateAuthority: {
      candidatePublication: structuredClone(facts.candidatePublication),
      topology: structuredClone(facts.topology),
    },
    allowedPaths: [...facts.allowedPaths],
    allowedPathsDigest: facts.allowedPathsDigest,
    prospectiveOverlay: createProspectiveTransitionOverlay({
      origin: facts.prospectiveProjection.overlay.origin,
      sourceBranch: facts.prospectiveProjection.overlay.sourceBranch,
      planId: facts.prospectiveProjection.overlay.planId,
    }),
    roadmap: {
      path: ".arc/backlog/ROADMAP.md",
      before: { kind: "absent" },
      after: firstAfter,
    },
    mutations,
  };
  const sourceUnit = facts.completedMap.machine.sourceUnits[0]!;
  return {
    plan,
    completedMap: facts.completedMap,
    sourceArtifactInventory: [{
      path: sourceUnit.sourcePath,
      objectKind: "blob" as const,
      mode: "100644" as const,
      contentDigest: sourceUnit.contentDigest,
    }],
    firstPath,
    secondPath,
  };
}

function partialOccupation(): DecomposeResultOccupationResult {
  return {
    status: "occupied",
    protection: "partial",
    candidateOwnership: { kind: "not-applicable", protection: "partial" },
  };
}

function fullOccupation(): DecomposeResultOccupationResult {
  const claimId = canonicalDigest("claim");
  return {
    status: "occupied",
    protection: "full",
    path: "/repo/.git/arc/worktrees/candidate",
    candidateOwnership: {
      kind: "claimed",
      protection: "full",
      claimId,
      generation: 2,
      candidateBranch: "chore/decompose-origin",
      candidateWorktree: v3CandidateWorktreeId(claimId, 2),
    },
  };
}

function preimages(plan: ValidatedDecomposePlan): V3PartialPathPreimage[] {
  const firstMutationPath = plan.mutations[0]!.path;
  return plan.allowedPaths.map((path) => ({
    path,
    index: path === firstMutationPath
      ? { kind: "object", objectKind: "blob", mode: "100755", bytes: encoder.encode("index") }
      : { kind: "absent" },
    worktree: path === firstMutationPath
      ? { kind: "object", objectKind: "blob", mode: "100644", bytes: encoder.encode("worktree") }
      : { kind: "absent" },
  }));
}

function dependencies(
  fixture: ReturnType<typeof operationFixture>,
  occupation: DecomposeResultOccupationResult,
  events: string[],
  overrides: Partial<V3DecomposeOperationDependencies> = {},
): V3DecomposeOperationDependencies {
  const states = new Map<string, V3PlanCanonicalPathState>(
    fixture.plan.mutations.map(({ path, before }) => [path, before]),
  );
  const captured = preimages(fixture.plan);
  return {
    occupy: async ({ plan }) => {
      expect(plan).toBe(fixture.plan);
      events.push("occupy");
      return occupation;
    },
    revalidate: async (plan) => {
      expect(plan).toBe(fixture.plan);
      events.push("revalidate");
      return { status: "valid" };
    },
    materializer: {
      observe: async (path) => {
        events.push(`observe:${path}`);
        return states.get(path) ?? { kind: "absent" };
      },
      readBlob: async (digest) => {
        events.push(`blob:${digest}`);
        return digest === firstAfter.contentDigest ? firstBytes : secondBytes;
      },
      applyAndStageFinal: async (path, state) => {
        events.push(`apply:${path}`);
        states.set(path, state);
      },
    },
    partialRecovery: {
      capture: async () => {
        events.push("capture");
        return captured;
      },
      restore: async (images) => {
        events.push(`restore:${images.map(({ path }) => path).join(",")}`);
      },
      verify: async (images) => {
        events.push(`verify:${images.map(({ path }) => path).join(",")}`);
        return { status: "restored" };
      },
    },
    ...overrides,
  };
}

describe("executeV3DecomposeOperation", () => {
  it("uses one plan through occupation, revalidation, materialization, reporting, and preparation", async () => {
    const fixture = operationFixture();
    const events: string[] = [];
    let forbiddenResolverCalls = 0;
    const deps = dependencies(fixture, partialOccupation(), events, {
      prepare: (input) => {
        expect(input.plan).toBe(fixture.plan);
        events.push("prepare");
        return createV3DecomposePreparation(input);
      },
    });
    Object.assign(deps, {
      sourceResolver: () => {
        forbiddenResolverCalls += 1;
      },
    });

    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
      sourceArtifactInventory: fixture.sourceArtifactInventory,
    }, deps);

    expect(result.status).toBe("prepared");
    expect(forbiddenResolverCalls).toBe(0);
    expect(events.indexOf("revalidate")).toBeLessThan(
      events.findIndex((event) => event.startsWith("apply:")),
    );
    expect(events.at(-1)).toBe("prepare");
    if (result.status !== "prepared") return;
    expect(result.preparation.facts.candidatePublication)
      .toEqual(fixture.plan.candidateAuthority.candidatePublication);
    expect(result.preparation.facts.topology).toEqual(fixture.plan.candidateAuthority.topology);
    expect(result.preparation.facts.candidateOwnership)
      .toEqual({ kind: "not-applicable", protection: "partial" });
  });

  it("binds full preparation to the exact occupied claim generation", async () => {
    const fixture = operationFixture();
    const occupation = fullOccupation();
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
      sourceArtifactInventory: fixture.sourceArtifactInventory,
    }, dependencies(fixture, occupation, []));

    expect(result.status).toBe("prepared");
    if (result.status !== "prepared" || occupation.status !== "occupied") return;
    expect(result.preparation.facts.candidateOwnership).toEqual(occupation.candidateOwnership);
    expect(result.preparation.facts.candidatePublication)
      .toEqual(fixture.plan.candidateAuthority.candidatePublication);
    expect(result.preparation.facts.topology).toEqual(fixture.plan.candidateAuthority.topology);
  });

  it("restores only actually changed partial paths from distinct index and worktree preimages", async () => {
    const fixture = operationFixture();
    const events: string[] = [];
    const captured = preimages(fixture.plan);
    let restored: readonly V3PartialPathPreimage[] = [];
    const deps = dependencies(fixture, partialOccupation(), events, {
      materializer: {
        observe: async () => ({ kind: "absent" }),
        readBlob: async (digest) => digest === firstAfter.contentDigest ? firstBytes : secondBytes,
        applyAndStageFinal: async (path) => {
          if (path === fixture.secondPath) throw new Error("stage failed");
        },
      },
      partialRecovery: {
        capture: async () => captured,
        restore: async (images) => {
          restored = images;
        },
        verify: async () => ({ status: "restored" }),
      },
    });

    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
      sourceArtifactInventory: fixture.sourceArtifactInventory,
    }, deps);

    expect(result).toMatchObject({
      status: "refused",
      stage: "materialization",
      reason: "apply-failed",
      recovery: {
        kind: "partial-restoration",
        status: "restored",
        restoredPaths: [fixture.firstPath],
      },
    });
    expect(restored).toEqual([captured.find(({ path }) => path === fixture.firstPath)]);
    expect(restored[0]?.index).not.toEqual(restored[0]?.worktree);
  });

  it("returns bounded restoration failure without claiming partial parity", async () => {
    const fixture = operationFixture();
    const deps = dependencies(fixture, partialOccupation(), [], {
      prepare: () => ({ status: "rejected", reason: "preparation-boundary-failed" }),
      partialRecovery: {
        capture: async () => preimages(fixture.plan),
        restore: async () => undefined,
        verify: async () => ({ status: "mismatch", path: fixture.firstPath }),
      },
    });
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
      sourceArtifactInventory: fixture.sourceArtifactInventory,
    }, deps);

    expect(result).toMatchObject({
      status: "refused",
      stage: "restoration",
      reason: "preparation-boundary-failed",
      recovery: {
        kind: "partial-restoration",
        status: "failed",
        affectedPaths: [fixture.firstPath, fixture.secondPath],
        path: fixture.firstPath,
      },
    });
  });

  it("restores partial paths when durable preparation persistence refuses", async () => {
    const fixture = operationFixture();
    const captured = preimages(fixture.plan);
    let restored: readonly V3PartialPathPreimage[] = [];
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
      sourceArtifactInventory: fixture.sourceArtifactInventory,
    }, dependencies(fixture, partialOccupation(), [], {
      partialRecovery: {
        capture: async () => captured,
        restore: async (images) => {
          restored = images;
        },
        verify: async () => ({ status: "restored" }),
      },
      persist: async () => ({ status: "refused", reason: "durable-authority-moved" }),
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "persistence",
      reason: "durable-authority-moved",
      recovery: {
        kind: "partial-restoration",
        status: "restored",
        restoredPaths: [fixture.firstPath, fixture.secondPath],
      },
    });
    expect(restored).toHaveLength(2);
  });

  it("leaves a full candidate with exact retry and discard facts at every post-occupation failure", async () => {
    const fixture = operationFixture();
    const occupation = fullOccupation();
    for (const overrides of [
      {
        revalidate: async () => ({ status: "refused" as const, reason: "source-moved" }),
      },
      {
        materializer: {
          observe: async () => ({ kind: "absent" as const }),
          readBlob: async () => firstBytes,
          applyAndStageFinal: async () => {
            throw new Error("write failed");
          },
        },
      },
      {
        prepare: () => ({ status: "rejected" as const, reason: "preparation-failed" }),
      },
    ]) {
      const result = await executeV3DecomposeOperation({
        protection: "full",
        configuredBase: "main",
        plan: fixture.plan,
        completedMap: fixture.completedMap,
        sourceArtifactInventory: fixture.sourceArtifactInventory,
      }, dependencies(fixture, occupation, [], overrides));
      expect(result).toMatchObject({
        status: "refused",
        recovery: {
          kind: "full-candidate",
          path: "/repo/.git/arc/worktrees/candidate",
          candidateOwnership: occupation.status === "occupied"
            ? occupation.candidateOwnership
            : undefined,
          retry: { kind: "retry", planId: fixture.plan.planId },
          discard: {
            kind: "discard",
            origin: "origin",
            cutMapDigest: fixture.plan.cutMapDigest,
          },
        },
      });
    }
  });

  it("projects checkout recovery facts returned by full occupation", async () => {
    const fixture = operationFixture();
    const occupied = fullOccupation();
    if (occupied.status !== "occupied" || occupied.protection !== "full") return;
    const checkoutFailure: DecomposeResultOccupationResult = {
      status: "refused",
      reason: "recovery-required",
      recovery: {
        path: occupied.path,
        candidateOwnership: occupied.candidateOwnership,
      },
    };
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
      sourceArtifactInventory: fixture.sourceArtifactInventory,
    }, dependencies(fixture, checkoutFailure, []));

    expect(result).toMatchObject({
      status: "refused",
      stage: "occupation",
      reason: "recovery-required",
      recovery: {
        kind: "full-candidate",
        path: occupied.path,
        candidateOwnership: occupied.candidateOwnership,
      },
    });
  });
});

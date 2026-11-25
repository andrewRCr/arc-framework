import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/kernel/canonical/canonical-json.js";
import {
  V3DecomposeOperationRecoverySchema,
  executeV3DecomposeOperation,
  executeV3ExtractionOperation,
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
import { createDecomposeTransitionRecord } from "../../../src/lib/work-unit/decompose-transition-record.js";
import { resolveTransitionRecordRelativePath } from "../../../src/lib/work-unit/transition-record-store.js";
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
    topology: structuredClone(facts.topology),
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
  };
}

function fullOccupation(): DecomposeResultOccupationResult {
  return {
    status: "occupied",
    protection: "full",
    path: "/repo/.git/arc/worktrees/candidate",
    candidateBranch: "chore/decompose-origin",
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
        return { status: "applied" };
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
    transitionRecords: {
      record: async () => {
        events.push("record");
        return { status: "recorded" };
      },
      rollback: async () => ({ status: "rolled-back" }),
    },
    ...overrides,
  };
}

function extractionReportFacts() {
  return {
    retainedOrigin: {
      origin: "origin",
      path: ".arc/active/meta-origin.md",
      allocations: [],
    },
    reasonedDrops: [],
    anchor: {
      kind: "surviving-origin" as const,
      origin: "origin",
      path: ".arc/active/meta-origin.md",
    },
  };
}

describe("decomposition preparation exception causes", () => {
  it.each([
    ["retirement", "occupation", "partial"], ["retirement", "occupation", "full"],
    ["retirement", "post-occupation-revalidation", "partial"],
    ["retirement", "post-occupation-revalidation", "full"],
    ["extraction", "occupation", "partial"], ["extraction", "occupation", "full"],
    ["extraction", "post-occupation-revalidation", "partial"],
    ["extraction", "post-occupation-revalidation", "full"],
  ] as const)("%s preserves the %s cause under %s protection and retries", async (mode, stage, protection) => {
    const fixture = operationFixture();
    const occupation = protection === "full" ? fullOccupation() : partialOccupation();
    let broken = true;
    const deps = dependencies(fixture, occupation, [], {
      occupy: async () => {
        if (broken && stage === "occupation") throw new Error("candidate observation failed");
        return occupation;
      },
      revalidate: async () => {
        if (broken && stage === "post-occupation-revalidation") throw new Error("source reread failed");
        return { status: "valid" };
      },
    });
    if (deps.partialRecovery !== undefined) {
      deps.partialRecovery.capture = async (paths) => paths.map((path) => ({
        path, index: { kind: "absent" as const }, worktree: { kind: "absent" as const },
      }));
    }
    const run = () => mode === "retirement"
      ? executeV3DecomposeOperation({ protection, configuredBase: "main", plan: fixture.plan,
          completedMap: fixture.completedMap }, deps)
      : executeV3ExtractionOperation({ protection, configuredBase: "main", origin: "origin",
          plan: fixture.plan, extractionFacts: extractionReportFacts() }, deps);
    const refused = await run();
    expect(refused).toMatchObject({
      status: "refused", stage,
      reason: stage === "occupation" ? "occupation-failed" : "post-occupation-revalidation-failed",
      locus: stage === "occupation" ? "candidate observation failed" : "source reread failed",
      recovery: stage === "occupation" || protection === "partial" ? { kind: "none" } : {
        kind: "full-candidate", path: "/repo/.git/arc/worktrees/candidate",
        candidateBranch: "chore/decompose-origin", expectedHead: fixture.plan.expectedBaseHead,
      },
    });
    expect(refused).not.toHaveProperty("report");
    broken = false;
    await expect(run()).resolves.toMatchObject({ status: "staged", occupation });
  });

  it.each([
    ["occupation", "adapter threw a string", "adapter threw a string"],
    ["post-occupation-revalidation", "adapter threw a string", "adapter threw a string"],
    ["occupation", new Error(" "), "occupation failed"],
    ["post-occupation-revalidation", new Error(" "), "post-occupation revalidation failed"],
  ] as const)("%s gives a usable cause for nonstandard throws: %s", async (stage, error, locus) => {
    const fixture = operationFixture();
    const result = await executeV3DecomposeOperation({ protection: "partial", configuredBase: "main",
      plan: fixture.plan, completedMap: fixture.completedMap }, dependencies(fixture, partialOccupation(), [], {
      ...(stage === "occupation" ? { occupy: async () => { throw error; } }
        : { revalidate: async () => { throw error; } }),
    }));
    expect(result).toMatchObject({ status: "refused", stage, locus });
  });
});

describe("executeV3DecomposeOperation", () => {
  it("validates every recovery arm strictly", () => {
    const recoveries = [
      { kind: "none" as const },
      {
        kind: "partial-restoration" as const,
        status: "restored" as const,
        restoredPaths: [".arc/active/meta-origin.md"],
      },
      {
        kind: "partial-restoration" as const,
        status: "failed" as const,
        affectedPaths: [".arc/active/meta-origin.md"],
        path: ".arc/active/meta-origin.md",
      },
      {
        kind: "full-candidate" as const,
        path: "/repo/.git/arc/worktrees/candidate",
        candidateBranch: "chore/decompose-origin",
        expectedHead: "base-head",
      },
    ];

    for (const recovery of recoveries) {
      expect(V3DecomposeOperationRecoverySchema.parse(recovery)).toEqual(recovery);
      expect(V3DecomposeOperationRecoverySchema.safeParse({ ...recovery, extra: true }).success)
        .toBe(false);
    }
    expect(V3DecomposeOperationRecoverySchema.safeParse({
      kind: "partial-restoration",
      status: "restored",
      affectedPaths: ["wrong-arm.md"],
    }).success).toBe(false);
  });

  it("stages an additive result without creating retirement history", async () => {
    const fixture = operationFixture();
    delete fixture.plan.prospectiveOverlay;
    const events: string[] = [];
    const extractionDependencies = dependencies(fixture, fullOccupation(), events);
    const extractionFacts = extractionReportFacts();

    const result = await executeV3ExtractionOperation({
      protection: "full",
      configuredBase: "main",
      origin: "origin",
      plan: fixture.plan,
      extractionFacts,
    }, extractionDependencies);

    expect(result.status).toBe("staged");
    if (result.status !== "staged") return;
    expect(events).not.toContain("record");
    expect(result.stagedPaths).toEqual([fixture.firstPath, fixture.secondPath]);
    expect(result.releasePaths).toEqual([fixture.firstPath, fixture.secondPath]);
    expect(result.report.extraction).toEqual(extractionFacts);
  });

  it("uses one plan through occupation, revalidation, materialization, reporting, and lean history", async () => {
    const fixture = operationFixture();
    const events: string[] = [];
    const recorded: unknown[] = [];
    const deps = dependencies(fixture, partialOccupation(), events, {
      transitionRecords: {
        record: async (record) => {
          recorded.push(record);
          events.push("record");
          return { status: "recorded" };
        },
        rollback: async () => ({ status: "rolled-back" }),
      },
    });

    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, deps);

    expect(result.status).toBe("staged");
    expect(events).toEqual([
      "occupy",
      "revalidate",
      "capture",
      `observe:${fixture.firstPath}`,
      `blob:${firstAfter.contentDigest}`,
      `observe:${fixture.secondPath}`,
      `blob:${secondAfter.contentDigest}`,
      `apply:${fixture.firstPath}`,
      `apply:${fixture.secondPath}`,
      "record",
    ]);
    expect(recorded).toEqual([createDecomposeTransitionRecord(fixture.completedMap)]);
  });

  it("returns the exact full candidate locus with the staged transition", async () => {
    const fixture = operationFixture();
    const occupation = fullOccupation();
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, occupation, []));

    expect(result.status).toBe("staged");
    if (result.status !== "staged" || occupation.status !== "occupied") return;
    expect(result.occupation).toEqual(occupation);
    expect(result.stagedPaths.at(-1)).toBe(resolveTransitionRecordRelativePath("origin"));
  });

  it("authorizes every reported materialization path for post-execute destination authoring", async () => {
    const fixture = operationFixture();
    const events: string[] = [];
    const deps = dependencies(fixture, fullOccupation(), events, {
      materializer: {
        observe: async (path) => {
          events.push(`observe:${path}`);
          return path === fixture.firstPath ? firstAfter : { kind: "absent" };
        },
        readBlob: async (digest) => digest === firstAfter.contentDigest ? firstBytes : secondBytes,
        applyAndStageFinal: async (path) => {
          events.push(`apply:${path}`);
          return { status: "applied" };
        },
      },
    });

    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, deps);

    expect(result.status).toBe("staged");
    if (result.status !== "staged") return;
    expect(result.report.paths).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: fixture.firstPath, disposition: "already-applied" }),
      expect.objectContaining({ path: fixture.secondPath, disposition: "applied" }),
    ]));
    expect(result.stagedPaths).toEqual([
      fixture.secondPath,
      resolveTransitionRecordRelativePath("origin"),
    ]);
    expect(result.releasePaths).toEqual([
      fixture.firstPath,
      fixture.secondPath,
      resolveTransitionRecordRelativePath("origin"),
    ]);
    expect(events).not.toContain(`apply:${fixture.firstPath}`);
  });

  it("preserves materialization locus and evidence beside report and recovery", async () => {
    const fixture = operationFixture();
    const observedBytes = encoder.encode("wrong final bytes\n");
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, fullOccupation(), [], {
      materializer: {
        observe: async () => ({ kind: "absent" }),
        readBlob: async () => observedBytes,
        applyAndStageFinal: async () => ({ status: "applied" }),
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "materialization",
      reason: "final-blob-mismatch",
      locus: fixture.firstPath,
      evidence: {
        expected: firstAfter.contentDigest,
        actual: {
          contentDigest: digestBytes(observedBytes),
          byteLength: observedBytes.byteLength,
        },
      },
      report: { status: "refused" },
      recovery: {
        kind: "full-candidate",
        candidateBranch: "chore/decompose-origin",
      },
    });
  });

  it("preserves post-occupation comparison evidence before materialization", async () => {
    const fixture = operationFixture();
    const evidence = {
      expected: fixture.plan.planId,
      actual: `sha256:${"f".repeat(64)}`,
    };
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, fullOccupation(), [], {
      revalidate: async () => ({
        status: "refused",
        reason: "repository-plan-drift",
        locus: "planId",
        evidence,
      }),
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "post-occupation-revalidation",
      reason: "repository-plan-drift",
      locus: "planId",
      evidence,
      recovery: { kind: "full-candidate" },
    });
  });

  it.each(["retirement", "extraction"] as const)(
    "restores only actually changed %s paths from distinct index and worktree preimages",
    async (mode) => {
      const fixture = operationFixture();
      if (mode === "extraction") delete fixture.plan.prospectiveOverlay;
      const events: string[] = [];
      const captured = preimages(fixture.plan);
      let restored: readonly V3PartialPathPreimage[] = [];
      const deps = dependencies(fixture, partialOccupation(), events, {
        materializer: {
          observe: async () => ({ kind: "absent" }),
          readBlob: async (digest) => digest === firstAfter.contentDigest ? firstBytes : secondBytes,
          applyAndStageFinal: async (path) => {
            if (path === fixture.secondPath) throw new Error("stage failed");
            return { status: "applied" };
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

      const result = mode === "retirement"
        ? await executeV3DecomposeOperation({
            protection: "partial",
            configuredBase: "main",
            plan: fixture.plan,
            completedMap: fixture.completedMap,
          }, deps)
        : await executeV3ExtractionOperation({
            protection: "partial",
            configuredBase: "main",
            origin: "origin",
            plan: fixture.plan,
            extractionFacts: extractionReportFacts(),
          }, deps);

      expect(result).toMatchObject({
        status: "refused",
        stage: "materialization",
        reason: "apply-failed",
        recovery: {
          kind: "partial-restoration",
          status: "restored",
          restoredPaths: [fixture.firstPath, fixture.secondPath],
        },
      });
      expect(restored).toEqual([
        captured.find(({ path }) => path === fixture.firstPath),
        captured.find(({ path }) => path === fixture.secondPath),
      ]);
      expect(restored[0]?.index).not.toEqual(restored[0]?.worktree);
    },
  );

  it("returns bounded restoration failure without claiming partial parity", async () => {
    const fixture = operationFixture();
    const deps = dependencies(fixture, partialOccupation(), [], {
      transitionRecords: {
        record: async () => ({ status: "unavailable", diagnostic: "history-write-failed" }),
        rollback: async () => ({ status: "rolled-back" }),
      },
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
    }, deps);

    expect(result).toMatchObject({
      status: "refused",
      stage: "restoration",
      reason: "partial-restoration-failed",
      locus: fixture.firstPath,
      recovery: {
        kind: "partial-restoration",
        status: "failed",
        affectedPaths: [fixture.firstPath, fixture.secondPath],
        path: fixture.firstPath,
      },
    });
  });

  it("normalizes failed materialization restoration with the mismatching path as locus", async () => {
    const fixture = operationFixture();
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, partialOccupation(), [], {
      materializer: {
        observe: async () => ({ kind: "absent" }),
        readBlob: async (digest) => digest === firstAfter.contentDigest ? firstBytes : secondBytes,
        applyAndStageFinal: async () => ({ status: "refused", mutated: true }),
      },
      partialRecovery: {
        capture: async () => preimages(fixture.plan),
        restore: async () => undefined,
        verify: async () => ({ status: "mismatch", path: fixture.firstPath }),
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "restoration",
      reason: "partial-restoration-failed",
      locus: fixture.firstPath,
      report: { status: "refused" },
      recovery: { kind: "partial-restoration", status: "failed", path: fixture.firstPath },
    });
  });

  it("restores partial paths when lean history staging refuses", async () => {
    const fixture = operationFixture();
    const captured = preimages(fixture.plan);
    let restored: readonly V3PartialPathPreimage[] = [];
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, partialOccupation(), [], {
      partialRecovery: {
        capture: async () => captured,
        restore: async (images) => {
          restored = images;
        },
        verify: async () => ({ status: "restored" }),
      },
      transitionRecords: {
        record: async () => ({ status: "origin-occupied" }),
        rollback: async () => ({ status: "rolled-back" }),
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "transition-record",
      reason: "transition-record-origin-occupied",
      recovery: {
        kind: "partial-restoration",
        status: "restored",
        restoredPaths: [fixture.firstPath, fixture.secondPath],
      },
    });
    expect(restored).toHaveLength(2);
  });

  it("normalizes a thrown transition-record diagnostic into code and locus", async () => {
    const fixture = operationFixture();
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, fullOccupation(), [], {
      transitionRecords: {
        record: async () => {
          throw new Error("transition record disk full");
        },
        rollback: async () => ({ status: "rolled-back" }),
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "transition-record",
      reason: "transition-record-write-failed",
      locus: "transition record disk full",
      report: { status: "reported" },
      recovery: { kind: "full-candidate" },
    });
  });

  it("rolls back lean history and transform paths when post-stage authority moves", async () => {
    const fixture = operationFixture();
    const events: string[] = [];
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, partialOccupation(), events, {
      revalidateStaged: async () => ({ status: "refused", reason: "source-moved-after-stage" }),
      transitionRecords: {
        record: async () => {
          events.push("record");
          return { status: "recorded" };
        },
        rollback: async () => {
          events.push("rollback-record");
          return { status: "rolled-back" };
        },
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "post-stage-revalidation",
      reason: "source-moved-after-stage",
      recovery: {
        kind: "partial-restoration",
        status: "restored",
        restoredPaths: [fixture.firstPath, fixture.secondPath],
      },
    });
    expect(events).toContain("rollback-record");
    expect(events).toContain(`restore:${fixture.firstPath},${fixture.secondPath}`);
  });

  it("normalizes transition-record rollback diagnostics into a stable refusal", async () => {
    const fixture = operationFixture();
    const evidence = { expected: fixture.plan.planId, actual: `sha256:${"e".repeat(64)}` };
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, partialOccupation(), [], {
      revalidateStaged: async () => ({
        status: "refused",
        reason: "repository-plan-drift",
        evidence,
      }),
      transitionRecords: {
        record: async () => ({ status: "recorded" }),
        rollback: async () => ({ status: "unavailable", diagnostic: "index cleanup failed" }),
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "restoration",
      reason: "transition-record-rollback-failed",
      locus: "index cleanup failed",
      report: { status: "reported" },
      recovery: { kind: "partial-restoration", status: "restored" },
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("normalizes a thrown transition-record rollback into code and locus", async () => {
    const fixture = operationFixture();
    const result = await executeV3DecomposeOperation({
      protection: "partial",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, partialOccupation(), [], {
      revalidateStaged: async () => ({ status: "refused", reason: "source-moved-after-stage" }),
      transitionRecords: {
        record: async () => ({ status: "recorded" }),
        rollback: async () => {
          throw new Error("transition record rollback crashed");
        },
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "restoration",
      reason: "transition-record-rollback-failed",
      locus: "transition record rollback crashed",
      report: { status: "reported" },
      recovery: { kind: "partial-restoration", status: "restored" },
    });
  });

  it("restores extraction paths without creating retirement history when post-stage authority moves", async () => {
    const fixture = operationFixture();
    delete fixture.plan.prospectiveOverlay;
    const events: string[] = [];
    const result = await executeV3ExtractionOperation({
      protection: "partial",
      configuredBase: "main",
      origin: "origin",
      plan: fixture.plan,
      extractionFacts: extractionReportFacts(),
    }, dependencies(fixture, partialOccupation(), events, {
      revalidateStaged: async () => ({ status: "refused", reason: "source-moved-after-stage" }),
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "post-stage-revalidation",
      reason: "source-moved-after-stage",
      recovery: {
        kind: "partial-restoration",
        status: "restored",
        restoredPaths: [fixture.firstPath, fixture.secondPath],
      },
    });
    expect(events).not.toContain("record");
    expect(events).toContain(`restore:${fixture.firstPath},${fixture.secondPath}`);
  });

  it("preserves a report and comparison evidence after staged extraction revalidation", async () => {
    const fixture = operationFixture();
    delete fixture.plan.prospectiveOverlay;
    const evidence = {
      expected: fixture.plan.planId,
      actual: `sha256:${"e".repeat(64)}`,
    };
    const result = await executeV3ExtractionOperation({
      protection: "partial",
      configuredBase: "main",
      origin: "origin",
      plan: fixture.plan,
      extractionFacts: extractionReportFacts(),
    }, dependencies(fixture, partialOccupation(), [], {
      revalidateStaged: async () => ({
        status: "refused",
        reason: "repository-plan-drift",
        locus: "planId",
        evidence,
      }),
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "post-stage-revalidation",
      reason: "repository-plan-drift",
      locus: "planId",
      evidence,
      report: { status: "reported", extraction: { anchor: { origin: "origin" } } },
      recovery: { kind: "partial-restoration", status: "restored" },
    });
  });

  it("normalizes failed post-stage restoration with its mismatching path", async () => {
    const fixture = operationFixture();
    delete fixture.plan.prospectiveOverlay;
    const evidence = { expected: fixture.plan.planId, actual: `sha256:${"e".repeat(64)}` };
    const result = await executeV3ExtractionOperation({
      protection: "partial",
      configuredBase: "main",
      origin: "origin",
      plan: fixture.plan,
      extractionFacts: extractionReportFacts(),
    }, dependencies(fixture, partialOccupation(), [], {
      revalidateStaged: async () => ({
        status: "refused",
        reason: "repository-plan-drift",
        evidence,
      }),
      partialRecovery: {
        capture: async () => preimages(fixture.plan),
        restore: async () => undefined,
        verify: async () => ({ status: "mismatch", path: fixture.secondPath }),
      },
    }));

    expect(result).toMatchObject({
      status: "refused",
      stage: "restoration",
      reason: "partial-restoration-failed",
      locus: fixture.secondPath,
      report: { status: "reported" },
      recovery: { kind: "partial-restoration", status: "failed", path: fixture.secondPath },
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("leaves exact ordinary cleanup facts at every full post-occupation failure", async () => {
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
        transitionRecords: {
          record: async () => ({ status: "unavailable" as const, diagnostic: "history-failed" }),
          rollback: async () => ({ status: "rolled-back" as const }),
        },
      },
    ]) {
      const result = await executeV3DecomposeOperation({
        protection: "full",
        configuredBase: "main",
        plan: fixture.plan,
        completedMap: fixture.completedMap,
      }, dependencies(fixture, occupation, [], overrides));
      expect(result).toMatchObject({
        status: "refused",
        recovery: {
          kind: "full-candidate",
          path: "/repo/.git/arc/worktrees/candidate",
          candidateBranch: "chore/decompose-origin",
          expectedHead: fixture.plan.expectedBaseHead,
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
        candidateBranch: occupied.candidateBranch,
      },
    };
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, checkoutFailure, []));

    expect(result).toMatchObject({
      status: "refused",
      stage: "occupation",
      reason: "recovery-required",
      recovery: {
        kind: "full-candidate",
        path: occupied.path,
        candidateBranch: occupied.candidateBranch,
        expectedHead: fixture.plan.expectedBaseHead,
      },
    });
  });

  it("preserves occupation comparison evidence", async () => {
    const fixture = operationFixture();
    const evidence = { expected: fixture.plan.expectedBaseHead, actual: "moved-base" };
    const result = await executeV3DecomposeOperation({
      protection: "full",
      configuredBase: "main",
      plan: fixture.plan,
      completedMap: fixture.completedMap,
    }, dependencies(fixture, {
      status: "refused",
      reason: "base-moved",
      evidence,
    }, []));

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "base-moved",
      evidence,
      recovery: { kind: "none" },
    });
  });
});

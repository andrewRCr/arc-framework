import { describe, expect, it } from "vitest";

import {
  createV3DecomposePreflight,
  revalidateV3DecomposePreflight,
  type V3DecomposePreflightInput,
} from "../../../src/lib/work-unit/decompose-v3-preflight.js";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function input(): V3DecomposePreflightInput {
  return {
    origin: "origin",
    sourceBase: {
      ref: "refs/heads/main",
      head: "a".repeat(40),
      origins: [{
        path: ".arc/backlog/planned/origin/meta-origin.md",
        origin: "origin",
        location: "backlog",
        state: "Planning",
        branch: null,
        planningProfile: { kind: "draft", sourceDesign: ["draft-origin.md"] },
      }],
      sourceArtifacts: [{
        path: ".arc/backlog/planned/origin/draft-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Draft\n\n## One\n"),
        allocatable: true,
      }],
      incomingEdges: [],
      outgoingEdges: [],
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    localBranches: [{
      ref: "refs/heads/plan/origin",
      head: "c".repeat(40),
      origins: [{
        path: ".arc/active/meta-origin.md",
        origin: "origin",
        location: "active",
        state: "Planning",
        branch: "plan/origin",
        planningProfile: { kind: "draft", sourceDesign: ["draft-origin.md"] },
      }],
      sourceArtifacts: [{
        path: ".arc/active/draft-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Draft\n\n## One\n"),
        allocatable: true,
      }],
      incomingEdges: [{ dependent: "consumer", currentTargets: ["origin"] }],
      outgoingEdges: [{ prerequisite: "foundation" }],
    }],
  };
}

describe("v3 decomposition preflight", () => {
  it("selects a self-authenticating branch tree, scans exact stored bytes, and leaves input unchanged", () => {
    const value = input();
    const before = structuredClone(value);
    const result = createV3DecomposePreflight(value);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.preflight.starterMap.machine).toMatchObject({
      source: {
        kind: "started-planning",
        logicalBranch: "plan/origin",
        ref: "refs/heads/plan/origin",
        head: "c".repeat(40),
      },
      resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
      planningProfile: { kind: "draft", sourceDesign: ["draft-origin.md"] },
    });
    expect(result.preflight.starterMap.machine.sourceUnits).toHaveLength(2);
    expect(result.preflight.starterMap.authoring.sourceAllocations).toHaveLength(2);
    expect(result.preflight.sourceArtifactInventory).toEqual([expect.objectContaining({
      path: ".arc/active/draft-origin.md",
      mode: "100644",
    })]);
    expect(value).toEqual(before);
  });

  it("falls back only to the exact configured-base predecessor", () => {
    const value = input();
    value.localBranches = [];
    const result = createV3DecomposePreflight(value);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.preflight.starterMap.machine.source).toMatchObject({
      kind: "backlog-stub",
      logicalBranch: "main",
      head: "a".repeat(40),
    });
  });

  it("returns deterministic source-selection refusals without choosing by ref order", () => {
    const value = input();
    const alias = structuredClone(value.localBranches[0]!);
    alias.ref = "refs/heads/plan/alias";
    alias.origins[0]!.branch = "plan/alias";
    value.localBranches = [alias, value.localBranches[0]!];
    expect(createV3DecomposePreflight(value)).toEqual({ status: "rejected", reason: "source-ambiguous" });

    const mismatched = input();
    mismatched.localBranches[0]!.origins[0]!.branch = "plan/not-origin";
    expect(createV3DecomposePreflight(mismatched)).toEqual({
      status: "rejected",
      reason: "source-self-identity",
    });
  });

  it("revalidates facts in its fixed first-mismatch order", () => {
    const initial = createV3DecomposePreflight(input());
    expect(initial.status).toBe("ready");
    if (initial.status !== "ready") return;

    const changed = input();
    changed.localBranches[0]!.head = "d".repeat(40);
    changed.resultBase.head = "e".repeat(40);
    changed.localBranches[0]!.sourceArtifacts[0]!.mode = "100755";
    expect(revalidateV3DecomposePreflight(initial.preflight, changed)).toEqual({
      status: "stale",
      reason: "source-head",
    });

    const artifactOnly = input();
    artifactOnly.localBranches[0]!.sourceArtifacts[0]!.mode = "100755";
    expect(revalidateV3DecomposePreflight(initial.preflight, artifactOnly)).toEqual({
      status: "stale",
      reason: "source-artifact-inventory",
    });

    const storedBytesOnly = input();
    storedBytesOnly.localBranches[0]!.sourceArtifacts[0]!.bytes = bytes("# Draft\n\n## One\nChanged body.\n");
    expect(revalidateV3DecomposePreflight(initial.preflight, storedBytesOnly)).toEqual({
      status: "stale",
      reason: "source-artifact-inventory",
    });
    const changedResult = createV3DecomposePreflight(storedBytesOnly);
    expect(changedResult.status).toBe("ready");
    if (changedResult.status !== "ready") return;
    expect(changedResult.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId))
      .toEqual(initial.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId));
    expect(changedResult.preflight.starterMap.machine.sourceUnits.map(({ contentDigest }) => contentDigest))
      .not.toEqual(initial.preflight.starterMap.machine.sourceUnits.map(({ contentDigest }) => contentDigest));
  });
});

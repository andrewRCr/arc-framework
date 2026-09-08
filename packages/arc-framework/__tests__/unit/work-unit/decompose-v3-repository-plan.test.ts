import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  composeV3ExtractionRepositoryPlan,
  composeV3RepositoryPlan,
  type V3RepositoryPlanTree,
} from "../../../src/lib/work-unit/decompose-v3-repository-plan.js";
import {
  createV3DecomposePreflight,
  type V3DecomposeStoredArtifact,
} from "../../../src/lib/work-unit/decompose-v3-preflight.js";

const encoder = new TextEncoder();
const cohortTemplate = readFileSync(
  new URL("../../../arc/reference/templates/arc/work-unit/template-cohort.md", import.meta.url),
);

function file(content: string) {
  return {
    kind: "object" as const,
    objectKind: "blob",
    mode: "100644",
    bytes: encoder.encode(content),
  };
}

function stored(path: string, content: string): V3DecomposeStoredArtifact {
  return { path, objectKind: "blob", mode: "100644", bytes: encoder.encode(content) };
}

function fixture() {
  const origin = "origin";
  const member = "member";
  const sourceHead = "2".repeat(40);
  const resultBaseHead = "1".repeat(40);
  const sourceDraft = `# Draft: ${origin}

- **Origin:** [internal]
- **Purpose:** Split the concern.

---

## Problem / Motivation

One concern.

## Alternatives

One alternative.

## Unknowns and Assumptions

One unknown.

## Scope Estimate

Medium.
`;
  const activeMeta = renderMetaFile(origin, {
    state: "Planning",
    owner: "andrew",
    branch: "plan/origin",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  });
  const plannedMeta = renderMetaFile(origin, {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  });
  const sourceArtifacts = [
    stored(".arc/active/draft-origin.md", sourceDraft),
    stored(".arc/active/meta-origin.md", activeMeta),
  ];
  const preflight = createV3DecomposePreflight({
    origin,
    sourceBase: {
      ref: "refs/heads/main",
      head: resultBaseHead,
      origins: [{
        path: ".arc/backlog/planned/origin/meta-origin.md",
        origin,
        location: "backlog",
        state: "Planning",
        branch: null,
        design: ["draft-origin.md"],
        taskList: null,
      }],
      sourceArtifacts: [
        stored(".arc/backlog/planned/origin/draft-origin.md", sourceDraft),
        stored(".arc/backlog/planned/origin/meta-origin.md", plannedMeta),
      ],
      incomingEdges: [],
      outgoingEdges: [],
    },
    resultBase: { ref: "refs/heads/main", head: resultBaseHead },
    localBranches: [{
      ref: "refs/heads/plan/origin",
      head: sourceHead,
      origins: [{
        path: ".arc/active/meta-origin.md",
        origin,
        location: "active",
        state: "Planning",
        branch: "plan/origin",
        design: ["draft-origin.md"],
        taskList: null,
      }],
      sourceArtifacts,
      incomingEdges: [],
      outgoingEdges: [],
    }],
  });
  if (preflight.status !== "ready") throw new Error(`preflight failed: ${preflight.reason}`);
  const machine = preflight.preflight.starterMap.machine;
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "heterogeneous" as const,
      placement: { kind: "direct-member" as const },
      destinations: [
        {
          kind: "existing-home" as const,
          destinationId: "existing",
          target: { kind: "document" as const, path: ".arc/reference/shared.txt" },
        },
        {
          kind: "new-member" as const,
          destinationId: "member",
          slug: member,
          workClass: "Heavy" as const,
        },
      ],
      internalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned" as const,
        disposition: {
          kind: "target" as const,
          destinationId: "member",
          targetLocator: { ...unit.sourceLocator, artifact: `draft-${member}.md` },
        },
      })),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const resultBaseTree: V3RepositoryPlanTree = {
    ".arc/backlog/ROADMAP.md": file("# Roadmap before\n"),
    ".arc/backlog/planned/origin/draft-origin.md": file(sourceDraft),
    ".arc/backlog/planned/origin/meta-origin.md": file(plannedMeta),
    ".arc/reference/shared.txt": file("shared\n"),
  };
  const sourceTree: V3RepositoryPlanTree = {
    ".arc/active/draft-origin.md": file(sourceDraft),
    ".arc/active/meta-origin.md": file(activeMeta),
    ".arc/backlog/ROADMAP.md": file("# Source roadmap\n"),
    ".arc/reference/shared.txt": file("shared\n"),
  };
  return {
    completedMap,
    preflight: preflight.preflight,
    resultBaseTree,
    sourceTree,
    mergeBaseTree: structuredClone(resultBaseTree),
    sourceHead,
    resultBaseHead,
  };
}

describe("v3 repository plan projection", () => {
  it("derives every path and byte operand from pinned trees and the completed map", async () => {
    const input = fixture();
    const renderRoadmap = vi.fn(async (
      tree: V3RepositoryPlanTree,
      overlay?: { origin: string; sourceBranch: string; planId: string },
    ) => encoder.encode([
      "# Roadmap after",
      overlay?.origin ?? "",
      overlay?.sourceBranch ?? "",
      ...Object.keys(tree).filter((path) => path.includes("meta-")).sort(),
      "",
    ].join("\n")));

    const result = await composeV3RepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap,
    });

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.sourceHead).toBe(input.sourceHead);
    expect(result.plan.expectedBaseHead).toBe(input.resultBaseHead);
    const concreteAllowedPaths = [
      ".arc/active/draft-origin.md",
      ".arc/active/meta-origin.md",
      ".arc/backlog/ROADMAP.md",
      ".arc/backlog/planned/member/draft-member.md",
      ".arc/backlog/planned/member/meta-member.md",
      ".arc/backlog/planned/origin/draft-origin.md",
      ".arc/backlog/planned/origin/meta-origin.md",
      ".arc/reference/shared.txt",
    ].sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
    expect(result.plan.allowedPaths).toEqual(concreteAllowedPaths);
    expect(result.plan.topology.facts).toEqual([{ kind: "none" }]);
    expect(result.sourceArtifactInventory).toEqual(input.preflight.sourceArtifactInventory);
    expect(result.blobs.map(({ contentDigest }) => contentDigest))
      .toEqual([...result.blobs.map(({ contentDigest }) => contentDigest)].sort());
    expect(renderRoadmap).toHaveBeenCalledOnce();
    expect(renderRoadmap.mock.calls[0]?.[1]).toMatchObject({
      origin: "origin",
      sourceBranch: "plan/origin",
      planId: result.plan.planId,
    });
    expect(renderRoadmap.mock.calls[0]?.[0]).toMatchObject({
      ".arc/backlog/planned/member/meta-member.md": { kind: "object" },
      ".arc/backlog/planned/origin/meta-origin.md": { kind: "absent" },
    });
  });

  it("refuses the first uncovered nonempty retiring artifact before planning its delta", async () => {
    const input = fixture();
    for (const [path, content] of [
      [".arc/active/tasks-origin.md", "# Tasks\n"],
      [".arc/active/notes-origin.md", "# Notes\n"],
    ] as const) {
      const state = file(content);
      input.sourceTree[path] = state;
      input.preflight.sourceArtifactInventory.push({
        path,
        objectKind: "blob",
        mode: "100644",
        contentDigest: digestBytes(state.bytes),
      });
    }
    input.preflight.sourceArtifactInventory.sort((left, right) =>
      Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")));

    const result = await composeV3RepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [],
      cohortTemplate,
      renderRoadmap: vi.fn(async () => encoder.encode("# Roadmap after\n")),
    });

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "conservation",
        reason: "live-conservation:uncovered-retirement-content",
        locus: ".arc/active/notes-origin.md",
      },
    });
  });

  it("excludes the source meta record and accepts an empty uncovered companion", async () => {
    const input = fixture();
    const path = ".arc/active/notes-origin.md";
    const state = file("");
    input.sourceTree[path] = state;
    input.preflight.sourceArtifactInventory.push({
      path,
      objectKind: "blob",
      mode: "100644",
      contentDigest: digestBytes(state.bytes),
    });
    input.preflight.sourceArtifactInventory.sort((left, right) =>
      Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")));

    const result = await composeV3RepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap: vi.fn(async () => encoder.encode("# Roadmap after\n")),
    });

    expect(result.status).toBe("composed");
  });

  it("refuses an unsupported existing destination object before rendering the result", async () => {
    const input = fixture();
    const unsupported = {
      kind: "object" as const,
      objectKind: "symlink",
      mode: "120000",
      bytes: encoder.encode("../foreign"),
    };
    input.sourceTree[".arc/reference/shared.txt"] = unsupported;
    input.mergeBaseTree[".arc/reference/shared.txt"] = unsupported;
    input.resultBaseTree[".arc/reference/shared.txt"] = unsupported;
    const renderRoadmap = vi.fn(async () => encoder.encode("# should not render\n"));

    const result = await composeV3RepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap,
    });

    expect(result).toMatchObject({
      status: "refused",
      refusal: { stage: "content", reason: "target-projection-failed" },
    });
    expect(renderRoadmap).not.toHaveBeenCalled();
  });

  it("routes additive cohort planning through surviving-origin topology without retirement authority", async () => {
    const input = fixture();
    input.completedMap.authoring.shape = "extraction" as never;
    input.completedMap.authoring.placement = { kind: "cohort", cohort: "origin" } as never;
    const allocations = input.completedMap.authoring.sourceAllocations;
    allocations[0]!.disposition = { kind: "retained-origin" } as never;
    allocations[1]!.disposition = {
      kind: "drop",
      reason: "obsolete framing",
    } as never;
    delete input.resultBaseTree[".arc/backlog/planned/origin/draft-origin.md"];
    delete input.resultBaseTree[".arc/backlog/planned/origin/meta-origin.md"];
    delete input.mergeBaseTree[".arc/backlog/planned/origin/draft-origin.md"];
    delete input.mergeBaseTree[".arc/backlog/planned/origin/meta-origin.md"];
    const renderRoadmap = vi.fn(async (
      tree: V3RepositoryPlanTree,
      overlay?: { origin: string },
    ) => encoder.encode([
      "# Roadmap after",
      String(overlay?.origin ?? "origin-visible"),
      ...Object.keys(tree).filter((path) => path.includes("meta-")).sort(),
      "",
    ].join("\n")));

    const result = await composeV3ExtractionRepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap,
    });

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.prospectiveOverlay).toBeUndefined();
    expect(result.plan.mutations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "predecessor-retirement" }),
      expect.objectContaining({ role: "retiring-source" }),
    ]));
    expect(result.plan.allowedPaths).not.toContain(".arc/active/meta-origin.md");
    expect(result.plan.allowedPaths).toContain(".arc/backlog/planned/origin/cohort-origin.md");
    expect(renderRoadmap.mock.calls[0]?.[1]).toBeUndefined();
    expect(renderRoadmap.mock.calls[0]?.[0]).toMatchObject({
      ".arc/backlog/planned/origin/cohort-origin.md": { kind: "object" },
      ".arc/backlog/planned/origin/member/meta-member.md": { kind: "object" },
    });
    expect(result.extractionFacts).toEqual({
      retainedOrigin: {
        origin: "origin",
        path: ".arc/active/meta-origin.md",
        allocations: [{ sourceId: allocations[0]!.sourceId, ownership: "destination-owned" }],
      },
      reasonedDrops: [{
        sourceId: allocations[1]!.sourceId,
        ownership: "destination-owned",
        reason: "obsolete framing",
      }],
      anchor: {
        kind: "surviving-origin",
        origin: "origin",
        path: ".arc/active/meta-origin.md",
      },
    });
  });
});

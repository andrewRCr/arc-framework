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
import {
  v3PreflightId,
  v3SourceArtifactDigest,
  type V3DecomposeCutMap,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

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

function boundedState(state: V3RepositoryPlanTree[string]) {
  if (state.kind === "absent") return { kind: "absent" };
  return {
    kind: "object",
    objectKind: state.objectKind,
    mode: state.mode,
    contentDigest: digestBytes(state.bytes),
    byteLength: state.bytes.byteLength,
  };
}

function stored(path: string, content: string): V3DecomposeStoredArtifact {
  return { path, objectKind: "blob", mode: "100644", bytes: encoder.encode(content) };
}

function fixture(options: {
  sourceState?: "Planning" | "Active";
  taskList?: string;
  notes?: string;
} = {}) {
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
    state: options.sourceState ?? "Planning",
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
    ...(options.taskList === undefined
      ? []
      : [stored(".arc/active/tasks-origin.md", options.taskList)]),
    ...(options.notes === undefined
      ? []
      : [stored(".arc/active/notes-origin.md", options.notes)]),
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
        ...(options.taskList === undefined
          ? []
          : [stored(".arc/backlog/planned/origin/tasks-origin.md", options.taskList)]),
        ...(options.notes === undefined
          ? []
          : [stored(".arc/backlog/planned/origin/notes-origin.md", options.notes)]),
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
  const completedMap: V3DecomposeCutMap = {
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
      externalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned" as const,
        disposition: {
          kind: "target" as const,
          destinationId: "member",
          targetLocator: {
            ...unit.sourceLocator,
            artifact: unit.sourcePath.endsWith("/tasks-origin.md")
              ? `tasks-${member}.md`
              : `draft-${member}.md`,
          },
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
    ...(options.taskList === undefined
      ? {}
      : { ".arc/backlog/planned/origin/tasks-origin.md": file(options.taskList) }),
    ...(options.notes === undefined
      ? {}
      : { ".arc/backlog/planned/origin/notes-origin.md": file(options.notes) }),
    ".arc/reference/shared.txt": file("shared\n"),
  };
  const sourceTree: V3RepositoryPlanTree = {
    ".arc/active/draft-origin.md": file(sourceDraft),
    ".arc/active/meta-origin.md": file(activeMeta),
    ...(options.taskList === undefined
      ? {}
      : { ".arc/active/tasks-origin.md": file(options.taskList) }),
    ...(options.notes === undefined
      ? {}
      : { ".arc/active/notes-origin.md": file(options.notes) }),
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

function configureExistingHomeExternal(
  input: ReturnType<typeof fixture>,
  sourceDependsOn: string[],
  resultBaseDependsOn: string[],
): string {
  const consumerPath = ".arc/backlog/planned/consumer/meta-consumer.md";
  const consumer = {
    state: "Planning" as const,
    owner: "andrew",
    workClass: "Light" as const,
    priority: "P2" as const,
    origin: "internal" as const,
    design: ["draft-consumer.md"],
    currentWorkflow: "draft-design",
    nextAction: "Continue planning",
  };
  input.sourceTree[consumerPath] = file(renderMetaFile("consumer", {
    ...consumer,
    dependsOn: sourceDependsOn,
  }));
  input.mergeBaseTree[consumerPath] = file(renderMetaFile("consumer", {
    ...consumer,
    dependsOn: sourceDependsOn,
  }));
  input.resultBaseTree[consumerPath] = file(renderMetaFile("consumer", {
    ...consumer,
    dependsOn: resultBaseDependsOn,
  }));
  input.resultBaseTree[".arc/backlog/planned/foundation/meta-foundation.md"] = file(renderMetaFile(
    "foundation",
    consumer,
  ));
  input.completedMap.authoring.destinations[0] = {
    kind: "existing-home",
    destinationId: "existing",
    target: { kind: "work-unit", slug: "consumer" },
  };
  input.completedMap.authoring.externalEdges = [{ from: "consumer", to: "foundation" }];
  return consumerPath;
}

describe("v3 repository plan projection", () => {
  it("scaffolds retitled notes only for the targeted member", async () => {
    const notes = "# Notes: origin\n\n## Evidence\n\nPreserve exactly.\n";
    const input = fixture({ notes });
    for (const unit of input.completedMap.machine.sourceUnits.filter((candidate) =>
      candidate.sourcePath.endsWith("/notes-origin.md"))) {
      const allocation = input.completedMap.authoring.sourceAllocations.find(
        ({ sourceId }) => sourceId === unit.sourceId,
      );
      if (allocation === undefined) throw new Error("fixture must allocate every notes unit");
      allocation.disposition = unit.sourceLocator.kind === "section"
        ? {
            kind: "target",
            destinationId: "member",
            targetLocator: {
              ...unit.sourceLocator,
              artifact: "notes-member.md",
            },
          }
        : { kind: "drop", reason: "member scaffold supplies the notes preamble" };
    }

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

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    const notesPath = ".arc/backlog/planned/member/notes-member.md";
    const notesMutation = result.plan.mutations.find(({ path }) => path === notesPath);
    expect(notesMutation).toMatchObject({
      kind: "composed",
      before: { kind: "absent" },
      after: { kind: "file", mode: "100644" },
      contributors: expect.arrayContaining([
        expect.objectContaining({
          kind: "content",
          artifactRole: "notes",
          contributorKind: "provisional-notes",
          disposition: "whole-file",
        }),
      ]),
    });
    if (notesMutation?.kind !== "composed" || notesMutation.after.kind !== "file") {
      throw new Error("member notes mutation must materialize a file");
    }
    const notesDigest = notesMutation.after.contentDigest;
    const notesBlob = result.blobs.find(({ contentDigest }) => contentDigest === notesDigest);
    expect(new TextDecoder().decode(notesBlob?.bytes)).toBe(notes.replace("origin", "member"));
    const memberMeta = result.plan.mutations.find(
      ({ path }) => path === ".arc/backlog/planned/member/meta-member.md",
    );
    if (memberMeta?.kind !== "composed" || memberMeta.after.kind !== "file") {
      throw new Error("member meta mutation must materialize a file");
    }
    const memberMetaDigest = memberMeta.after.contentDigest;
    const memberMetaBlob = result.blobs.find(({ contentDigest }) => contentDigest === memberMetaDigest);
    expect(new TextDecoder().decode(memberMetaBlob?.bytes)).not.toMatch(/^- \*\*Notes:\*\*/mu);

    const untargeted = fixture({ notes });
    for (const unit of untargeted.completedMap.machine.sourceUnits.filter((candidate) =>
      candidate.sourcePath.endsWith("/notes-origin.md"))) {
      const allocation = untargeted.completedMap.authoring.sourceAllocations.find(
        ({ sourceId }) => sourceId === unit.sourceId,
      );
      if (allocation === undefined) throw new Error("fixture must allocate every notes unit");
      allocation.disposition = { kind: "drop", reason: "notes do not belong in this member" };
    }
    const untargetedResult = await composeV3RepositoryPlan({
      completedMap: untargeted.completedMap,
      currentPreflight: untargeted.preflight,
      sourceTree: untargeted.sourceTree,
      mergeBaseTree: untargeted.mergeBaseTree,
      resultBaseTree: untargeted.resultBaseTree,
      mergeBases: [untargeted.resultBaseHead],
      cohortTemplate,
      renderRoadmap: vi.fn(async () => encoder.encode("# Roadmap after\n")),
    });
    expect(untargetedResult.status, JSON.stringify(untargetedResult)).toBe("composed");
    if (untargetedResult.status !== "composed") return;
    expect(untargetedResult.plan.mutations.some(
      ({ path }) => path === ".arc/backlog/planned/member/notes-member.md",
    )).toBe(false);
  });

  it("identifies an incomplete source meta needed for a member scaffold", async () => {
    const input = fixture();
    const path = ".arc/active/meta-origin.md";
    const current = input.sourceTree[path]!;
    if (current.kind === "absent") throw new Error("fixture source meta must exist");
    const changed = file(new TextDecoder().decode(current.bytes).replace("`andrew`", "[none]"));
    input.sourceTree[path] = changed;
    const inventory = input.preflight.sourceArtifactInventory;
    const meta = inventory.find((artifact) => artifact.path === path)!;
    meta.contentDigest = digestBytes(changed.bytes);
    input.preflight.sourceArtifactDigest = v3SourceArtifactDigest(inventory)!;

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "scaffold-source-meta-incomplete",
        locus: "member:.arc/active/meta-origin.md",
      },
    });
  });

  it("preserves retirement comparison evidence at the repository-plan boundary", async () => {
    const input = fixture();
    const path = ".arc/backlog/planned/origin/meta-origin.md";
    const expected = input.mergeBaseTree[path]!;
    if (expected.kind === "absent") throw new Error("fixture predecessor must exist");
    const actual = file(new TextDecoder().decode(expected.bytes).replace("`P1`", "`P2`"));
    input.resultBaseTree[path] = actual;

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "retirement",
        reason: "predecessor-changed",
        locus: path,
        evidence: {
          expected: boundedState(expected),
          actual: boundedState(actual),
        },
      },
    });
  });

  it("retires the open predecessor artifact family in canonical path order", async () => {
    const input = fixture();
    const directory = ".arc/backlog/planned/origin";
    const assurancePath = `${directory}/assurance-origin.md`;
    const cohortPath = `${directory}/cohort-origin.md`;
    const assurance = file("# Assurance\n");
    const cohort = file("# Cohort\n");
    input.mergeBaseTree[assurancePath] = assurance;
    input.resultBaseTree[assurancePath] = assurance;
    input.mergeBaseTree[cohortPath] = cohort;
    input.sourceTree[cohortPath] = cohort;
    input.resultBaseTree[cohortPath] = cohort;

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

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    const predecessorRetirements = result.plan.mutations
      .filter((mutation) => mutation.kind === "exclusive"
        && mutation.path.startsWith(`${directory}/`)
        && mutation.role !== "roadmap")
      .map(({ path }) => path);
    expect(predecessorRetirements).toEqual([
      assurancePath,
      `${directory}/draft-origin.md`,
      `${directory}/meta-origin.md`,
    ]);
    expect(result.plan.allowedPaths).not.toContain(cohortPath);
  });

  it("keeps an unrelated source-private file visible as a rider", async () => {
    const input = fixture();
    const riderPath = ".arc/reference/supporting-origin.md";
    input.sourceTree[riderPath] = file("# Supporting material\n");

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "retirement",
        reason: "source-private-added",
        locus: riderPath,
      },
    });
  });

  it("refuses a changed nonstandard predecessor companion at its exact path", async () => {
    const input = fixture();
    const path = ".arc/backlog/planned/origin/assurance-origin.md";
    const expected = file("# Assurance before\n");
    const actual = file("# Assurance after\n");
    input.mergeBaseTree[path] = expected;
    input.resultBaseTree[path] = actual;

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "retirement",
        reason: "predecessor-changed",
        locus: path,
        evidence: {
          expected: boundedState(expected),
          actual: boundedState(actual),
        },
      },
    });
  });

  it("reports the expected and observed source metadata paths", async () => {
    const input = fixture();
    const actualPath = ".arc/backlog/planned/origin/meta-origin.md";
    input.sourceTree[actualPath] = input.sourceTree[".arc/active/meta-origin.md"]!;
    delete input.sourceTree[".arc/active/meta-origin.md"];

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "source",
        reason: "source-meta-mismatch",
        locus: ".arc/active/meta-origin.md",
        evidence: {
          expected: ".arc/active/meta-origin.md",
          actual: actualPath,
        },
      },
    });
  });

  it("reports the expected and observed source artifact facts", async () => {
    const input = fixture();
    const path = ".arc/active/draft-origin.md";
    input.sourceTree[path] = file("changed source\n");
    const expected = input.preflight.sourceArtifactInventory.find((artifact) => artifact.path === path)!;
    const actual = input.sourceTree[path]!;

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "source",
        reason: "source-artifact-mismatch",
        locus: path,
        evidence: {
          expected,
          actual: {
            path,
            objectKind: actual.kind === "object" ? actual.objectKind : "absent",
            mode: actual.kind === "object" ? actual.mode : "absent",
            contentDigest: actual.kind === "object" ? digestBytes(actual.bytes) : "absent",
          },
        },
      },
    });
  });

  it("preserves machine-binding evidence through the conservation prefix", async () => {
    const input = fixture();
    input.completedMap.machine = structuredClone(input.completedMap.machine);
    const machine = input.completedMap.machine;
    const expectedHead = "3".repeat(40);
    machine.source.head = expectedHead;
    machine.preflightId = v3PreflightId({
      source: machine.source,
      resultBase: machine.resultBase,
      planningProfile: machine.planningProfile,
      sourceUnits: machine.sourceUnits,
      incomingEdges: machine.incomingEdges,
      outgoingEdges: machine.outgoingEdges,
    });

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "conservation",
        reason: "machine-binding:source-head",
        locus: "machine.source.head",
        evidence: {
          expected: expectedHead,
          actual: input.preflight.starterMap.machine.source.head,
        },
      },
    });
  });

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

  it("projects a live external edge through member metadata and the staged roadmap tree", async () => {
    const input = fixture();
    const targetPath = ".arc/backlog/planned/foundation/meta-foundation.md";
    input.resultBaseTree[targetPath] = file(renderMetaFile("foundation", {
      state: "Planning",
      owner: "andrew",
      workClass: "Light",
      priority: "P2",
      origin: "internal",
      design: ["draft-foundation.md"],
      currentWorkflow: "draft-design",
      nextAction: "Continue planning",
    }));
    input.completedMap.authoring.externalEdges = [{ from: "member", to: "foundation" }];
    const renderRoadmap = vi.fn(async (tree: V3RepositoryPlanTree) => {
      const member = tree[".arc/backlog/planned/member/meta-member.md"];
      const memberText = member?.kind === "object" ? new TextDecoder().decode(member.bytes) : "";
      return encoder.encode(`# Roadmap after\n\n${memberText.includes("Depends On:** `foundation`")}\n`);
    });

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
    const memberPath = ".arc/backlog/planned/member/meta-member.md";
    const memberMutation = result.plan.mutations.find(({ path }) => path === memberPath);
    expect(memberMutation).toMatchObject({
      kind: "composed",
      contributors: expect.arrayContaining([expect.objectContaining({ kind: "dependency" })]),
    });
    const roadmapMutation = result.plan.mutations.find(({ path }) => path === ".arc/backlog/ROADMAP.md");
    if (roadmapMutation?.kind !== "exclusive" || roadmapMutation.after.kind !== "file") {
      throw new Error("roadmap mutation must contain a staged file");
    }
    const roadmapDigest = roadmapMutation.after.contentDigest;
    const roadmapBlob = result.blobs.find(
      ({ contentDigest }) => contentDigest === roadmapDigest,
    );
    expect(new TextDecoder().decode(roadmapBlob?.bytes)).toContain("true");
  });

  it("projects an external edge to a completed meta without parsing its blob", async () => {
    const input = fixture();
    input.resultBaseTree[
      ".arc/completed/2026-q3/49_foundation/meta-foundation.md"
    ] = { ...file(""), bytes: new Uint8Array([0xff]) };
    input.completedMap.authoring.externalEdges = [{ from: "member", to: "foundation" }];

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

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    const memberMutation = result.plan.mutations.find(
      ({ path }) => path === ".arc/backlog/planned/member/meta-member.md",
    );
    expect(memberMutation).toMatchObject({
      kind: "composed",
      contributors: expect.arrayContaining([expect.objectContaining({ kind: "dependency" })]),
    });
  });

  it("ignores a non-regular completed metadata tree entry", async () => {
    const input = fixture();
    input.resultBaseTree[
      ".arc/completed/2026-q3/49_foundation/meta-foundation.md"
    ] = { kind: "object", objectKind: "tree", mode: "040000", bytes: new Uint8Array() };
    input.completedMap.authoring.externalEdges = [{ from: "member", to: "foundation" }];

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "conservation",
        reason: "dependency-projection:unknown-external-target",
        locus: "authoring.externalEdges.0.to",
      },
    });
  });

  it("rebases an existing-home external edge onto the pinned dependency sequence", async () => {
    const input = fixture();
    const consumerPath = configureExistingHomeExternal(input, ["source-only"], ["base-only"]);

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

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    const mutation = result.plan.mutations.find(({ path }) => path === consumerPath);
    if (mutation?.kind !== "composed" || mutation.after.kind !== "file") {
      throw new Error("consumer mutation must contain a staged file");
    }
    const mutationDigest = mutation.after.contentDigest;
    const blob = result.blobs.find(({ contentDigest }) => contentDigest === mutationDigest);
    const text = new TextDecoder().decode(blob?.bytes);
    expect(text).toContain("**Depends On:** `base-only`, `foundation`");
    expect(text).not.toContain("source-only");
  });

  it("refuses an external edge already satisfied on the pinned result base", async () => {
    const input = fixture();
    configureExistingHomeExternal(input, [], ["foundation"]);

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "dependency",
        reason: "unchanged-dependency-slot",
        locus: "authoring.externalEdges.0",
      },
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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "existing-home-unresolvable",
        locus: "existing:.arc/reference/shared.txt",
      },
    });
    expect(renderRoadmap).not.toHaveBeenCalled();
  });

  it("rejects an incompatible member artifact before projection", async () => {
    const input = fixture();
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    if (allocation.disposition.kind !== "target") throw new Error("fixture allocation must target");
    allocation.disposition.targetLocator = {
      ...allocation.disposition.targetLocator,
      artifact: "other-member.md",
    };

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "conservation",
        reason: "ownership:incompatible-allocation-locator",
        locus: "authoring.sourceAllocations.0.disposition.targetLocator",
      },
    });
  });

  it("identifies a locator that does not resolve in projected target bytes", async () => {
    const input = fixture();
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    if (allocation.disposition.kind !== "target") throw new Error("fixture allocation must target");
    allocation.disposition.targetLocator = {
      artifact: "draft-member.md",
      kind: "section",
      level: 2,
      headingSource: "Missing",
      ancestry: [],
      occurrence: 0,
    };

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "target-locator-unresolved",
        locus: "member:.arc/backlog/planned/member/draft-member.md",
      },
    });
  });

  it("composes task phases into a provisional member scaffold and an existing home", async () => {
    const taskList = `# Task List: origin

Introductory context.

## Phase One

### Task 1

First phase body.

## Phase Two

Second phase body.
`;
    const input = fixture({ taskList });
    const sharedPath = ".arc/reference/shared.md";
    const shared = file("# Shared\n\n## Existing Slot\n\nExisting body.\n");
    for (const tree of [input.sourceTree, input.mergeBaseTree, input.resultBaseTree]) {
      delete tree[".arc/reference/shared.txt"];
      tree[sharedPath] = shared;
    }
    const existing = input.completedMap.authoring.destinations.find(
      (destination) => destination.destinationId === "existing",
    );
    if (existing?.kind !== "existing-home" || existing.target.kind !== "document") {
      throw new Error("fixture existing destination must be a document");
    }
    existing.target.path = sharedPath;
    const phaseOneUnit = input.completedMap.machine.sourceUnits.find((unit) =>
      unit.sourcePath.endsWith("/tasks-origin.md")
      && unit.sourceLocator.kind === "section"
      && unit.sourceLocator.headingSource === "Phase One");
    if (phaseOneUnit === undefined) throw new Error("fixture must scan the first task phase");
    const phaseOneAllocation = input.completedMap.authoring.sourceAllocations.find(
      ({ sourceId }) => sourceId === phaseOneUnit.sourceId,
    );
    if (phaseOneAllocation === undefined) throw new Error("fixture must allocate the first task phase");
    phaseOneAllocation.disposition = {
      kind: "target",
      destinationId: "existing",
      targetLocator: {
        artifact: "shared.md",
        kind: "section",
        level: 2,
        headingSource: "Existing Slot",
        ancestry: [],
        occurrence: 0,
      },
    };

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

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    const memberTaskPath = ".arc/backlog/planned/member/tasks-member.md";
    const memberTask = result.plan.mutations.find(({ path }) => path === memberTaskPath);
    expect(memberTask).toMatchObject({
      kind: "composed",
      before: { kind: "absent" },
      after: { kind: "file" },
      contributors: expect.arrayContaining([
        expect.objectContaining({
          kind: "content",
          artifactRole: "tasks",
          contributorKind: "provisional-task",
          disposition: "whole-file",
        }),
        expect.objectContaining({
          kind: "content",
          artifactRole: "tasks",
          contributorKind: "allocation",
          sourceProjection: [expect.objectContaining({
            targetLocator: expect.objectContaining({ artifact: "tasks-member.md" }),
          })],
        }),
      ]),
    });
    const existingHome = result.plan.mutations.find(({ path }) => path === sharedPath);
    expect(existingHome).toMatchObject({
      kind: "composed",
      contributors: expect.arrayContaining([
        expect.objectContaining({ contributorKind: "existing-home-edit" }),
        expect.objectContaining({
          contributorKind: "allocation",
          sourceProjection: [{
            sourceId: phaseOneUnit.sourceId,
            targetLocator: phaseOneAllocation.disposition.kind === "target"
              ? phaseOneAllocation.disposition.targetLocator
              : undefined,
          }],
        }),
      ]),
    });
    if (memberTask?.kind !== "composed" || memberTask.after.kind !== "file") {
      throw new Error("member task mutation must materialize a file");
    }
    const memberTaskDigest = memberTask.after.contentDigest;
    const memberTaskBlob = result.blobs.find(
      ({ contentDigest }) => contentDigest === memberTaskDigest,
    );
    expect(new TextDecoder().decode(memberTaskBlob?.bytes)).toBe(
      taskList.replace("# Task List: origin", "# Task List: member"),
    );
    const memberMeta = result.plan.mutations.find(
      ({ path }) => path === ".arc/backlog/planned/member/meta-member.md",
    );
    if (memberMeta?.kind !== "composed" || memberMeta.after.kind !== "file") {
      throw new Error("member meta mutation must materialize a file");
    }
    const memberMetaDigest = memberMeta.after.contentDigest;
    const memberMetaBlob = result.blobs.find(
      ({ contentDigest }) => contentDigest === memberMetaDigest,
    );
    expect(new TextDecoder().decode(memberMetaBlob?.bytes)).toContain("- **Task List:** [none]");
  });

  it("rejects a task phase locator that does not resolve in the member scaffold", async () => {
    const input = fixture({
      taskList: "# Task List: origin\n\n## Phase One\n\nFirst phase body.\n",
    });
    const allocation = input.completedMap.authoring.sourceAllocations.find((candidate) =>
      candidate.disposition.kind === "target"
      && candidate.disposition.targetLocator.artifact === "tasks-member.md"
      && candidate.disposition.targetLocator.kind === "section");
    if (allocation?.disposition.kind !== "target") {
      throw new Error("fixture must allocate one task phase");
    }
    allocation.disposition.targetLocator = {
      artifact: "tasks-member.md",
      kind: "section",
      level: 2,
      headingSource: "Missing Phase",
      ancestry: [],
      occurrence: 0,
    };

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "target-locator-unresolved",
        locus: "member:.arc/backlog/planned/member/tasks-member.md",
      },
    });
  });

  it("identifies a missing target-driven scaffold source", async () => {
    const input = fixture();
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    if (allocation.disposition.kind !== "target") throw new Error("fixture allocation must target");
    allocation.disposition.targetLocator = {
      ...allocation.disposition.targetLocator,
      artifact: "tasks-member.md",
    };

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

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "scaffold-source-missing",
        locus: "member:.arc/active/tasks-origin.md",
      },
    });
  });

  it("distinguishes invalid UTF-8 in an unscanned target-driven scaffold source", async () => {
    const input = fixture({ sourceState: "Active" });
    input.completedMap.authoring.shape = "extraction" as never;
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    if (allocation.disposition.kind !== "target") throw new Error("fixture allocation must target");
    allocation.disposition.targetLocator = {
      ...allocation.disposition.targetLocator,
      artifact: "tasks-member.md",
    };
    input.sourceTree[".arc/active/tasks-origin.md"] = {
      ...file("# Tasks: origin\n"),
      bytes: Uint8Array.from([0xff]),
    };

    const result = await composeV3ExtractionRepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap: vi.fn(async () => encoder.encode("# Roadmap after\n")),
    });

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "scaffold-source-invalid-encoding",
        locus: "member:.arc/active/tasks-origin.md",
      },
    });
  });

  it.each([
    ["missing", undefined, "scaffold-source-missing"],
    [
      "invalid UTF-8",
      { ...file("# Notes: origin\n"), bytes: Uint8Array.from([0xff]) },
      "scaffold-source-invalid-encoding",
    ],
    ["missing title", file("body without title\n"), "scaffold-title-missing"],
  ] as const)("classifies a %s unscanned notes scaffold source", async (_case, source, reason) => {
    const input = fixture({ sourceState: "Active" });
    input.completedMap.authoring.shape = "extraction" as never;
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    if (allocation.disposition.kind !== "target") throw new Error("fixture allocation must target");
    allocation.disposition.targetLocator = {
      ...allocation.disposition.targetLocator,
      artifact: "notes-member.md",
    };
    if (source !== undefined) input.sourceTree[".arc/active/notes-origin.md"] = source;

    const result = await composeV3ExtractionRepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap: vi.fn(async () => encoder.encode("# Roadmap after\n")),
    });

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason,
        locus: "member:.arc/active/notes-origin.md",
      },
    });
  });

  it("distinguishes a valid UTF-8 scaffold source without a title", async () => {
    const input = fixture({ sourceState: "Active" });
    input.completedMap.authoring.shape = "extraction" as never;
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    if (allocation.disposition.kind !== "target") throw new Error("fixture allocation must target");
    allocation.disposition.targetLocator = {
      ...allocation.disposition.targetLocator,
      artifact: "tasks-member.md",
    };
    input.sourceTree[".arc/active/tasks-origin.md"] = file("body without title\n");

    const result = await composeV3ExtractionRepositoryPlan({
      completedMap: input.completedMap,
      currentPreflight: input.preflight,
      sourceTree: input.sourceTree,
      mergeBaseTree: input.mergeBaseTree,
      resultBaseTree: input.resultBaseTree,
      mergeBases: [input.resultBaseHead],
      cohortTemplate,
      renderRoadmap: vi.fn(async () => encoder.encode("# Roadmap after\n")),
    });

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "content",
        reason: "scaffold-title-missing",
        locus: "member:.arc/active/tasks-origin.md",
      },
    });
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

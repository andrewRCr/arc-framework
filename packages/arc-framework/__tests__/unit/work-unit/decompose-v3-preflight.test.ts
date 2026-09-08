import { describe, expect, it } from "vitest";

import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import { resolveV3DecomposeSourceUnit } from "../../../src/lib/work-unit/decompose-content.js";
import {
  createV3DecomposePreflight,
  revalidateV3DecomposeCutMapBinding,
  revalidateV3DecomposePreflight,
  type V3DecomposePreflight,
  type V3DecomposePreflightInput,
} from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import {
  createV3DecomposeStarterMap,
  parseV3DecomposeStarterMap,
  v3OutgoingEdgeId,
  v3PreflightId,
  v3SourceArtifactDigest,
  v3SourceId,
  type V3DecomposeMachine,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

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
        design: ["draft-origin.md"],
        taskList: null,
      }],
      sourceArtifacts: [{
        path: ".arc/backlog/planned/origin/draft-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Draft\n\n## One\n"),
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
        design: ["draft-origin.md"],
        taskList: null,
      }],
      sourceArtifacts: [{
        path: ".arc/active/draft-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Draft\n\n## One\n"),
      }],
      incomingEdges: [{ dependent: "consumer", currentTargets: ["origin"] }],
      outgoingEdges: [{ prerequisite: "foundation" }],
    }],
  };
}

function preflightForMachine(machine: V3DecomposeMachine): V3DecomposePreflight {
  const starterMap = createV3DecomposeStarterMap(machine);
  const sourceArtifactDigest = v3SourceArtifactDigest([]);
  if (starterMap === null || sourceArtifactDigest === null) throw new Error("valid test preflight");
  return {
    sourceOriginPath: ".arc/active/meta-origin.md",
    sourceArtifactInventory: [],
    sourceArtifactDigest,
    starterMap,
  };
}

function withPreflightId(machine: V3DecomposeMachine): V3DecomposeMachine {
  const { preflightId, ...facts } = machine;
  void preflightId;
  return { preflightId: v3PreflightId(facts), ...facts };
}

describe("v3 decomposition preflight", () => {
  it.each([
    ["started Planning", "started-planning"],
    ["backlog", "backlog-stub"],
  ] as const)("scans every non-meta %s companion into authenticated source units", (_label, kind) => {
    const value = input();
    if (kind === "backlog-stub") value.localBranches = [];
    const snapshot = kind === "backlog-stub" ? value.sourceBase : value.localBranches[0]!;
    const metaPath = snapshot.origins[0]!.path;
    const directory = metaPath.slice(0, metaPath.lastIndexOf("/"));
    const companionPath = `${directory}/assurance-origin.md`;
    const companion = {
      path: companionPath,
      objectKind: "blob" as const,
      mode: "100644" as const,
      bytes: bytes("# Assurance\n\n## Guard\n\nPreserve this.\n"),
    };
    const design = snapshot.sourceArtifacts[0]!;
    snapshot.sourceArtifacts = [
      companion,
      { path: metaPath, objectKind: "blob", mode: "100644", bytes: new Uint8Array([0xff]) },
      design,
    ];
    const withoutCompanion = structuredClone(value);
    const baselineSnapshot = kind === "backlog-stub"
      ? withoutCompanion.sourceBase
      : withoutCompanion.localBranches[0]!;
    baselineSnapshot.sourceArtifacts = baselineSnapshot.sourceArtifacts.filter(
      ({ path }) => path !== companionPath,
    );

    const result = createV3DecomposePreflight(value);
    const baseline = createV3DecomposePreflight(withoutCompanion);

    expect(result.status).toBe("ready");
    expect(baseline.status).toBe("ready");
    if (result.status !== "ready" || baseline.status !== "ready") return;
    expect(result.preflight.sourceArtifactInventory.map(({ path }) => path)).toEqual([
      companionPath,
      design.path,
      metaPath,
    ].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
    const companionUnits = result.preflight.starterMap.machine.sourceUnits.filter(
      ({ sourcePath }) => sourcePath === companionPath,
    );
    expect(companionUnits).toHaveLength(2);
    expect(companionUnits.every((unit) =>
      resolveV3DecomposeSourceUnit(unit, companion.bytes).status === "resolved")).toBe(true);
    expect(result.preflight.starterMap.machine.sourceUnits.some(
      ({ sourcePath }) => sourcePath === metaPath,
    )).toBe(false);
    expect(result.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId)).toEqual(
      [...result.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId)]
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
    );
    expect(result.preflight.starterMap.machine.preflightId)
      .not.toBe(baseline.preflight.starterMap.machine.preflightId);
  });

  it.each([
    ["started Planning", "started-planning"],
    ["backlog", "backlog-stub"],
  ] as const)("binds %s task-list phases into machine identity and author slots", (_label, kind) => {
    const value = input();
    if (kind === "backlog-stub") value.localBranches = [];
    const snapshot = kind === "backlog-stub" ? value.sourceBase : value.localBranches[0]!;
    const metaPath = snapshot.origins[0]!.path;
    const directory = metaPath.slice(0, metaPath.lastIndexOf("/"));
    const taskPath = `${directory}/tasks-origin.md`;
    snapshot.sourceArtifacts = [
      ...snapshot.sourceArtifacts,
      {
        path: taskPath,
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Tasks\n\n## Phase One\n### Task 1\nBody.\n\n## Phase Two\nBody.\n"),
      },
    ];
    const withoutTaskList = structuredClone(value);
    const baselineSnapshot = kind === "backlog-stub"
      ? withoutTaskList.sourceBase
      : withoutTaskList.localBranches[0]!;
    baselineSnapshot.sourceArtifacts = baselineSnapshot.sourceArtifacts.filter(
      ({ path }) => path !== taskPath,
    );

    const result = createV3DecomposePreflight(value);
    const baseline = createV3DecomposePreflight(withoutTaskList);

    expect(result.status).toBe("ready");
    expect(baseline.status).toBe("ready");
    if (result.status !== "ready" || baseline.status !== "ready") return;
    const taskUnits = result.preflight.starterMap.machine.sourceUnits.filter(
      ({ sourcePath }) => sourcePath === taskPath,
    );
    const expectedLocators: Array<V3DecomposeMachine["sourceUnits"][number]["sourceLocator"]> = [
      { artifact: "tasks-origin.md", kind: "preamble" },
      {
        artifact: "tasks-origin.md",
        kind: "section",
        level: 2,
        headingSource: "Phase One",
        ancestry: [],
        occurrence: 0,
      },
      {
        artifact: "tasks-origin.md",
        kind: "section",
        level: 2,
        headingSource: "Phase Two",
        ancestry: [],
        occurrence: 0,
      },
    ];
    expect(taskUnits.map(({ sourceLocator }) => sourceLocator)).toEqual(
      [...expectedLocators].sort((left, right) => Buffer.compare(
        Buffer.from(v3SourceId({ sourcePath: taskPath, sourceLocator: left })),
        Buffer.from(v3SourceId({ sourcePath: taskPath, sourceLocator: right })),
      )),
    );
    expect(result.preflight.starterMap.authoring.sourceAllocations.map(({ sourceId }) => sourceId))
      .toEqual(result.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId));
    expect(result.preflight.starterMap.machine.planningProfile).toEqual({
      kind: "draft",
      sourceDesign: ["draft-origin.md"],
    });
    expect(result.preflight.starterMap.machine.preflightId)
      .not.toBe(baseline.preflight.starterMap.machine.preflightId);
  });

  it.each([
    ["started Planning", "started-planning"],
    ["backlog", "backlog-stub"],
  ] as const)("rejects invalid UTF-8 in a scanned %s companion at its source path", (_label, kind) => {
    const value = input();
    if (kind === "backlog-stub") value.localBranches = [];
    const snapshot = kind === "backlog-stub" ? value.sourceBase : value.localBranches[0]!;
    const metaPath = snapshot.origins[0]!.path;
    const directory = metaPath.slice(0, metaPath.lastIndexOf("/"));
    const companionPath = `${directory}/assurance-origin.md`;
    snapshot.sourceArtifacts = [
      ...snapshot.sourceArtifacts,
      {
        path: companionPath,
        objectKind: "blob",
        mode: "100644",
        bytes: new Uint8Array([0xff]),
      },
    ];

    expect(createV3DecomposePreflight(value)).toEqual({
      status: "rejected",
      reason: "source-scan",
      locus: companionPath,
    });
  });

  it("admits an Active origin through production preflight", () => {
    const value = input();
    const source = value.localBranches[0]!;
    source.ref = "refs/heads/feat/origin";
    source.origins[0]!.state = "Active";
    source.origins[0]!.branch = "feat/origin";
    source.origins[0]!.design = ["spec-origin.md"];
    source.origins[0]!.taskList = "tasks-origin.md";
    source.sourceArtifacts = [
      {
        path: ".arc/active/spec-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Spec\n\n## One\n"),
      },
      {
        path: ".arc/active/tasks-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: bytes("# Tasks\n\n## Work\n"),
      },
      {
        path: ".arc/active/assurance-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: new Uint8Array([0xff]),
      },
      {
        path: ".arc/active/meta-origin.md",
        objectKind: "blob",
        mode: "100644",
        bytes: new Uint8Array([0xff]),
      },
    ];

    const result = createV3DecomposePreflight(value);

    expect(result).toMatchObject({
      status: "ready",
      preflight: {
        starterMap: {
          machine: {
            source: { kind: "active-origin", logicalBranch: "feat/origin" },
            planningProfile: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
          },
        },
      },
    });
    if (result.status !== "ready") return;
    expect(parseV3DecomposeStarterMap(result.preflight.starterMap)).not.toBeNull();
    expect(result.preflight.starterMap.machine.sourceUnits.every(({ sourcePath }) =>
      sourcePath.endsWith("spec-origin.md"))).toBe(true);
    expect(result.preflight.sourceArtifactInventory.map(({ path }) => path)).toContain(
      ".arc/active/assurance-origin.md",
    );
  });

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
    expect(result.preflight.sourceOriginPath).toBe(".arc/active/meta-origin.md");
    expect(result.preflight.starterMap.machine.sourceUnits).toHaveLength(2);
    expect(result.preflight.starterMap.authoring.sourceAllocations).toHaveLength(2);
    expect(result.preflight.sourceArtifactInventory).toEqual([expect.objectContaining({
      path: ".arc/active/draft-origin.md",
      mode: "100644",
    })]);
    expect(value).toEqual(before);
  });

  it("retains the source-predecessor refusal for nonqualifying active metadata", () => {
    const value = input();
    value.localBranches[0]!.origins[0]!.state = "Completed";

    expect(createV3DecomposePreflight(value)).toMatchObject({
      status: "ready",
      preflight: { starterMap: { machine: { source: { kind: "backlog-stub" } } } },
    });
    value.localBranches = [];
    value.sourceBase.origins[0]!.state = "Completed";
    expect(createV3DecomposePreflight(value)).toEqual({
      status: "rejected",
      reason: "source-predecessor",
    });
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
    expect(result.preflight.sourceOriginPath).toBe(
      ".arc/backlog/planned/origin/meta-origin.md",
    );

    const provisional = input();
    provisional.localBranches = [];
    provisional.sourceBase.origins[0]!.state = "Provisional";
    expect(createV3DecomposePreflight(provisional)).toMatchObject({
      status: "ready",
      preflight: {
        starterMap: {
          machine: { source: { kind: "backlog-stub", logicalBranch: "main" } },
        },
      },
    });

    const activeBase = input();
    activeBase.localBranches = [];
    activeBase.sourceBase.origins = [{
      ...activeBase.sourceBase.origins[0]!,
      path: ".arc/active/meta-origin.md",
      location: "active",
      branch: "main",
    }];
    activeBase.sourceBase.sourceArtifacts[0]!.path = ".arc/active/draft-origin.md";
    expect(createV3DecomposePreflight(activeBase)).toMatchObject({
      status: "ready",
      preflight: {
        starterMap: {
          machine: { source: { kind: "started-planning", logicalBranch: "main" } },
        },
      },
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

    const duplicatePath = input();
    duplicatePath.localBranches[0]!.origins = [
      ...duplicatePath.localBranches[0]!.origins,
      structuredClone(duplicatePath.localBranches[0]!.origins[0]!),
    ];
    expect(createV3DecomposePreflight(duplicatePath)).toEqual({
      status: "rejected",
      reason: "source-origin-duplicate",
    });

    const incompatibleBase = input();
    incompatibleBase.localBranches = [];
    incompatibleBase.sourceBase.origins[0]!.state = "Active";
    expect(createV3DecomposePreflight(incompatibleBase)).toEqual({
      status: "rejected",
      reason: "source-predecessor",
    });

    const sameHeadAlias = input();
    const aliasWithoutIdentity = structuredClone(sameHeadAlias.localBranches[0]!);
    aliasWithoutIdentity.ref = "refs/heads/plan/alias";
    sameHeadAlias.localBranches = [...sameHeadAlias.localBranches, aliasWithoutIdentity];
    expect(createV3DecomposePreflight(sameHeadAlias)).toEqual({
      status: "rejected",
      reason: "source-self-identity",
    });

    const duplicatedRef = input();
    duplicatedRef.localBranches = [
      ...duplicatedRef.localBranches,
      structuredClone(duplicatedRef.localBranches[0]!),
    ];
    expect(createV3DecomposePreflight(duplicatedRef)).toEqual({
      status: "rejected",
      reason: "source-candidate-duplicate",
    });
  });

  it("revalidates facts in its fixed first-mismatch order", () => {
    const initial = createV3DecomposePreflight(input());
    expect(initial.status).toBe("ready");
    if (initial.status !== "ready") return;

    expect(revalidateV3DecomposePreflight(initial.preflight, input())).toEqual({
      status: "current",
      preflight: initial.preflight,
    });

    const changed = input();
    changed.localBranches[0]!.head = "d".repeat(40);
    changed.resultBase.head = "e".repeat(40);
    changed.localBranches[0]!.sourceArtifacts[0]!.mode = "100755";
    expect(revalidateV3DecomposePreflight(initial.preflight, changed)).toEqual({
      status: "stale",
      reason: "source-head",
      evidence: {
        expected: "c".repeat(40),
        actual: "d".repeat(40),
      },
    });

    const artifactOnly = input();
    artifactOnly.localBranches[0]!.sourceArtifacts[0]!.mode = "100755";
    const artifactChanged = createV3DecomposePreflight(artifactOnly);
    expect(artifactChanged.status).toBe("ready");
    if (artifactChanged.status !== "ready") return;
    expect(revalidateV3DecomposePreflight(initial.preflight, artifactOnly)).toEqual({
      status: "stale",
      reason: "source-artifact-inventory",
      evidence: {
        expected: initial.preflight.sourceArtifactInventory,
        actual: artifactChanged.preflight.sourceArtifactInventory,
      },
    });

    const storedBytesOnly = input();
    storedBytesOnly.localBranches[0]!.sourceArtifacts[0]!.bytes = bytes("# Draft\n\n## One\nChanged body.\n");
    const changedUnitIndex = initial.preflight.starterMap.machine.sourceUnits.findIndex(({ sourceLocator }) =>
      sourceLocator.kind === "section" && sourceLocator.headingSource === "One");
    const changedResult = createV3DecomposePreflight(storedBytesOnly);
    expect(changedResult.status).toBe("ready");
    if (changedResult.status !== "ready") return;
    expect(revalidateV3DecomposePreflight(initial.preflight, storedBytesOnly)).toEqual({
      status: "stale",
      reason: "source-units",
      locus: `machine.sourceUnits.${changedUnitIndex}.contentDigest`,
      evidence: {
        expected: initial.preflight.starterMap.machine.sourceUnits[changedUnitIndex]!.contentDigest,
        actual: changedResult.preflight.starterMap.machine.sourceUnits[changedUnitIndex]!.contentDigest,
      },
    });
    expect(changedResult.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId))
      .toEqual(initial.preflight.starterMap.machine.sourceUnits.map(({ sourceId }) => sourceId));
    expect(changedResult.preflight.starterMap.machine.sourceUnits.map(({ contentDigest }) => contentDigest))
      .not.toEqual(initial.preflight.starterMap.machine.sourceUnits.map(({ contentDigest }) => contentDigest));

    const changedIncoming = input();
    changedIncoming.localBranches[0]!.incomingEdges = [];
    expect(revalidateV3DecomposePreflight(initial.preflight, changedIncoming)).toEqual({
      status: "stale",
      reason: "incoming-edges",
      locus: "machine.incomingEdges.0",
      evidence: {
        expected: initial.preflight.starterMap.machine.incomingEdges[0],
        actual: { kind: "absent" },
      },
    });

    const removedUnit = input();
    removedUnit.localBranches[0]!.sourceArtifacts[0]!.bytes = bytes("# Draft\n\n");
    expect(revalidateV3DecomposePreflight(initial.preflight, removedUnit)).toEqual({
      status: "stale",
      reason: "source-units",
      locus: "machine.sourceUnits.1.sourceLocator",
      evidence: {
        expected: initial.preflight.starterMap.machine.sourceUnits[1]!.sourceLocator,
        actual: { kind: "absent" },
      },
    });
  });

  it.each([
    ["logical branch", "source-logical-branch", "machine.source.logicalBranch",
      (machine: V3DecomposeMachine) => {
        const expected = machine.source.logicalBranch;
        const actual = "plan/other";
        machine.source.logicalBranch = actual;
        return { expected, actual };
      }],
    ["source ref", "source-ref", "machine.source.ref", (machine: V3DecomposeMachine) => {
      const expected = machine.source.ref;
      const actual = "refs/heads/plan/other";
      machine.source.ref = actual;
      return { expected, actual };
    }],
    ["source head", "source-head", "machine.source.head", (machine: V3DecomposeMachine) => {
      const expected = machine.source.head;
      const actual = "f".repeat(40);
      machine.source.head = actual;
      return { expected, actual };
    }],
    ["result ref", "result-ref", "machine.resultBase.ref", (machine: V3DecomposeMachine) => {
      const expected = machine.resultBase.ref;
      const actual = "refs/heads/integration";
      machine.resultBase.ref = actual;
      return { expected, actual };
    }],
    ["result head", "result-head", "machine.resultBase.head", (machine: V3DecomposeMachine) => {
      const expected = machine.resultBase.head;
      const actual = "e".repeat(40);
      machine.resultBase.head = actual;
      return { expected, actual };
    }],
  ] as const)("carries both %s operands across completed-map binding", (_label, reason, locus, change) => {
    const completedMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    const currentMachine = structuredClone(completedMap.machine);
    const evidence = change(currentMachine);
    const refreshedMachine = withPreflightId(currentMachine);

    expect(revalidateV3DecomposeCutMapBinding(
      completedMap,
      preflightForMachine(refreshedMachine),
    )).toEqual({
      status: "stale",
      reason,
      locus,
      evidence,
    });
  });

  it("carries comparison evidence for every structured completed-map binding", () => {
    const planningMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    const planningMachine = structuredClone(planningMap.machine);
    planningMachine.planningProfile = { kind: "single-spec", sourceDesign: ["spec-origin.md"] };
    const refreshedPlanning = withPreflightId(planningMachine);
    expect(revalidateV3DecomposeCutMapBinding(
      planningMap,
      preflightForMachine(refreshedPlanning),
    )).toEqual({
      status: "stale",
      reason: "planning-profile",
      locus: "machine.planningProfile",
      evidence: {
        expected: { kind: "draft", sourceDesign: ["draft-origin.md"] },
        actual: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
      },
    });

    const unitMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    const unitMachine = structuredClone(unitMap.machine);
    unitMachine.sourceUnits[0]!.contentDigest = `sha256:${"f".repeat(64)}`;
    const refreshedUnits = withPreflightId(unitMachine);
    expect(revalidateV3DecomposeCutMapBinding(
      unitMap,
      preflightForMachine(refreshedUnits),
    )).toEqual({
      status: "stale",
      reason: "source-units",
      locus: "machine.sourceUnits.0",
      evidence: {
        expected: unitMap.machine.sourceUnits[0],
        actual: refreshedUnits.sourceUnits[0],
      },
    });

    const incomingMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    const incomingMachine = structuredClone(incomingMap.machine);
    incomingMachine.incomingEdges = [];
    const refreshedIncoming = withPreflightId(incomingMachine);
    expect(revalidateV3DecomposeCutMapBinding(
      incomingMap,
      preflightForMachine(refreshedIncoming),
    )).toEqual({
      status: "stale",
      reason: "incoming-edges",
      locus: "machine.incomingEdges.0",
      evidence: {
        expected: incomingMap.machine.incomingEdges[0],
        actual: { kind: "absent" },
      },
    });

    const outgoingMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    const outgoingMachine = structuredClone(outgoingMap.machine);
    const prerequisite = "foundation";
    outgoingMachine.outgoingEdges = [{
      edgeId: v3OutgoingEdgeId({ prerequisite }),
      prerequisite,
    }];
    const refreshedOutgoing = withPreflightId(outgoingMachine);
    expect(revalidateV3DecomposeCutMapBinding(
      outgoingMap,
      preflightForMachine(refreshedOutgoing),
    )).toEqual({
      status: "stale",
      reason: "outgoing-edges",
      locus: "machine.outgoingEdges.0",
      evidence: {
        expected: { kind: "absent" },
        actual: refreshedOutgoing.outgoingEdges[0],
      },
    });

    const identityMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
    const currentIdentity = identityMap.machine.preflightId;
    identityMap.machine.preflightId = `sha256:${"f".repeat(64)}`;
    expect(revalidateV3DecomposeCutMapBinding(
      identityMap,
      preflightForMachine({ ...identityMap.machine, preflightId: currentIdentity }),
    )).toEqual({
      status: "stale",
      reason: "preflight-id",
      locus: "machine.preflightId",
      evidence: {
        expected: `sha256:${"f".repeat(64)}`,
        actual: currentIdentity,
      },
    });
  });
});

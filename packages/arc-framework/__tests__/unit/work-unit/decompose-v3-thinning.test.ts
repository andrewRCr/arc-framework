import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  scanV3DecomposeContent,
} from "../../../src/lib/work-unit/decompose-content.js";
import {
  executeV3ExtractionSourceFinish,
  type V3ExtractionSourceFinishIO,
  type V3PartialPathPreimage,
} from "../../../src/lib/work-unit/decompose-v3-finish-operation.js";
import {
  planV3ExtractionSourceThinning,
  type V3ExtractionSourceThinningFilePlan,
} from "../../../src/lib/work-unit/decompose-v3-thinning.js";
import type { V3DecomposePreflight } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import type { V3RepositoryPlanTree } from "../../../src/lib/work-unit/decompose-v3-repository-plan.js";
import {
  createV3DecomposeStarterMap,
  decodeV3DecomposeCutMap,
  v3PreflightId,
  v3SourceArtifactDigest,
  v3SourceId,
  type V3DecomposeCutMap,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

const encoder = new TextEncoder();
const specPath = ".arc/active/spec-origin.md";
const rfcPath = ".arc/active/rfc-origin.txt";
const companionArtifacts = [
  { path: ".arc/active/tasks-origin.md", mode: "100644" as const, bytes: encoder.encode("# Tasks\n\n## Phase 1\n") },
  { path: ".arc/active/notes-origin.md", mode: "100644" as const, bytes: encoder.encode("# Notes\n\nExact notes.\n") },
  { path: ".arc/active/journal-origin.md", mode: "100755" as const, bytes: encoder.encode("# Journal\r\n\r\nExact log.\r\n") },
];

function reidentify(machine: V3DecomposeCutMap["machine"]): void {
  machine.preflightId = v3PreflightId({
    source: machine.source,
    resultBase: machine.resultBase,
    planningProfile: machine.planningProfile,
    sourceUnits: machine.sourceUnits,
    incomingEdges: machine.incomingEdges,
    outgoingEdges: machine.outgoingEdges,
  });
}

function fixture(specText = [
  "\uFEFFintro",
  "## Transfer",
  "move 😀",
  "## Keep",
  "stay",
  "## Drop",
  "gone",
  "",
].join("\r\n"), withCompanions = false) {
  const stored = [
    { path: rfcPath, mode: "100644" as const, bytes: encoder.encode("whole\n") },
    { path: specPath, mode: "100755" as const, bytes: encoder.encode(specText) },
    ...(withCompanions ? companionArtifacts : []),
  ].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const sourceUnits = stored.flatMap((artifact) => {
    const name = artifact.path.split("/").at(-1)!;
    const scan = scanV3DecomposeContent(name, artifact.bytes);
    if (scan.status !== "scanned") throw new Error(scan.reason);
    return scan.units.map((unit) => ({
      sourcePath: artifact.path,
      sourceLocator: unit.locator,
      sourceId: v3SourceId({ sourcePath: artifact.path, sourceLocator: unit.locator }),
      contentDigest: digestBytes(unit.bytes),
    }));
  }).sort((left, right) => Buffer.compare(Buffer.from(left.sourceId), Buffer.from(right.sourceId)));
  const facts = {
    source: {
      origin: "origin",
      kind: withCompanions ? "started-planning" as const : "active-origin" as const,
      logicalBranch: "feat/origin",
      ref: "refs/heads/feat/origin",
      head: "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    planningProfile: {
      kind: "paired-spec" as const,
      sourceDesign: ["spec-origin.md", "rfc-origin.txt"] as [string, string],
    },
    sourceUnits,
    incomingEdges: [],
    outgoingEdges: [],
  };
  const machine = { preflightId: v3PreflightId(facts), ...facts };
  const completedMap: V3DecomposeCutMap = {
    schemaVersion: 3,
    machine,
    authoring: {
      shape: "extraction",
      placement: { kind: "direct-member" },
      destinations: [{
        kind: "new-member",
        destinationId: "member",
        slug: "member",
        workClass: "Light",
      }],
      internalEdges: [],
      externalEdges: [],
      sourceAllocations: sourceUnits.map((unit) => {
        const locator = unit.sourceLocator;
        const artifact = unit.sourcePath.split("/").at(-1)!;
        const disposition = !facts.planningProfile.sourceDesign.includes(artifact)
          ? { kind: "retained-origin" as const }
          : locator.kind === "preamble"
          || (locator.kind === "section" && locator.headingSource === "Keep")
          ? { kind: "retained-origin" as const }
          : locator.kind === "section" && locator.headingSource === "Drop"
            ? { kind: "drop" as const, reason: "Superseded by extracted scope." }
            : {
                kind: "target" as const,
                destinationId: "member",
                targetLocator: {
                  ...locator,
                  artifact: locator.artifact === "spec-origin.md" ? "spec-member.md" : "rfc-member.md",
                },
              };
        return { sourceId: unit.sourceId, ownership: "destination-owned" as const, disposition };
      }),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const decoded = decodeV3DecomposeCutMap(completedMap);
  if (decoded.status !== "accepted") throw new Error(JSON.stringify(decoded.issue));
  const inventory = stored.map((artifact) => ({
    path: artifact.path,
    objectKind: "blob" as const,
    mode: artifact.mode,
    contentDigest: digestBytes(artifact.bytes),
  }));
  const sourceArtifactDigest = v3SourceArtifactDigest(inventory);
  const starterMap = createV3DecomposeStarterMap(machine);
  if (sourceArtifactDigest === null || starterMap === null) throw new Error("invalid fixture preflight");
  const currentPreflight: V3DecomposePreflight = {
    sourceOriginPath: ".arc/active/meta-origin.md",
    sourceArtifactInventory: inventory,
    sourceArtifactDigest,
    starterMap,
  };
  const sourceTree: V3RepositoryPlanTree = Object.fromEntries(stored.map((artifact) => [
    artifact.path,
    {
      kind: "object" as const,
      objectKind: "blob",
      mode: artifact.mode,
      bytes: artifact.bytes,
    },
  ]));
  return { completedMap, currentPreflight, sourceTree, specText };
}

function finishIO(
  sourceTree: V3RepositoryPlanTree,
  files: readonly V3ExtractionSourceThinningFilePlan[],
): { io: V3ExtractionSourceFinishIO; state: Map<string, V3PartialPathPreimage> } {
  const state = new Map<string, V3PartialPathPreimage>();
  for (const file of files) {
    const source = sourceTree[file.path];
    if (source === undefined || source.kind === "absent") throw new Error(`missing source ${file.path}`);
    state.set(file.path, {
      path: file.path,
      index: structuredClone(source),
      worktree: structuredClone(source),
    });
  }
  const capture = (paths: readonly string[]): Promise<V3PartialPathPreimage[]> => Promise.resolve(
    paths.map((path) => {
      const value = state.get(path);
      if (value === undefined) throw new Error(`missing finish state ${path}`);
      return structuredClone(value);
    }),
  );
  const io: V3ExtractionSourceFinishIO = {
    capture,
    verify: async (preimages) => {
      const observed = await capture(preimages.map(({ path }) => path));
      return JSON.stringify(observed) === JSON.stringify(preimages)
        ? { status: "restored" }
        : { status: "mismatch", path: preimages[0]?.path ?? "source" };
    },
    restore: async (preimages) => {
      for (const preimage of preimages) state.set(preimage.path, structuredClone(preimage));
    },
    apply: (file) => {
      if (companionArtifacts.some(({ path }) => path === file.path)) {
        return Promise.resolve({
          status: "refused" as const,
          reason: "companion-mutation",
          mutated: false,
        });
      }
      const after = file.after.kind === "absent"
        ? { kind: "absent" as const }
        : {
            kind: "object" as const,
            objectKind: "blob" as const,
            mode: file.after.mode,
            bytes: structuredClone(file.after.bytes),
          };
      state.set(file.path, {
        path: file.path,
        index: structuredClone(after),
        worktree: structuredClone(after),
      });
      return Promise.resolve({ status: "applied" as const });
    },
  };
  return { io, state };
}

describe("planV3ExtractionSourceThinning", () => {
  it("plans authenticated task, notes, and generic companions as exact no-op files", () => {
    const result = planV3ExtractionSourceThinning(fixture(undefined, true));
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;

    for (const companion of companionArtifacts) {
      const file = result.files.find(({ path }) => path === companion.path);
      expect(file).toEqual({
        path: companion.path,
        before: {
          mode: companion.mode,
          contentDigest: digestBytes(companion.bytes),
          byteLength: companion.bytes.byteLength,
        },
        after: { kind: "file", mode: companion.mode, bytes: companion.bytes },
        removedLocators: [],
      });
    }
  });

  it("omits exact no-op companions from the pending finish preview", async () => {
    const input = fixture(undefined, true);
    const thinning = planV3ExtractionSourceThinning(input);
    if (thinning.status !== "planned") throw new Error(thinning.reason);
    const { io } = finishIO(input.sourceTree, thinning.files);

    await expect(executeV3ExtractionSourceFinish(thinning.files, false, io)).resolves.toEqual({
      status: "previewed",
      files: thinning.files.filter(({ path }) => path === rfcPath || path === specPath),
    });
  });

  it("omits exact no-op companions from apply and preserves their bytes and modes", async () => {
    const input = fixture(undefined, true);
    const thinning = planV3ExtractionSourceThinning(input);
    if (thinning.status !== "planned") throw new Error(thinning.reason);
    const { io, state } = finishIO(input.sourceTree, thinning.files);

    await expect(executeV3ExtractionSourceFinish(thinning.files, true, io))
      .resolves.toEqual({ status: "finished" });
    for (const companion of companionArtifacts) {
      expect(state.get(companion.path)).toEqual({
        path: companion.path,
        index: {
          kind: "object",
          objectKind: "blob",
          mode: companion.mode,
          bytes: companion.bytes,
        },
        worktree: {
          kind: "object",
          objectKind: "blob",
          mode: companion.mode,
          bytes: companion.bytes,
        },
      });
    }
  });

  it("removes transferred and reasoned-drop units while retaining exact source bytes and modes", () => {
    const input = fixture();
    const result = planV3ExtractionSourceThinning(input);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;

    expect(result.files.map(({ path }) => path)).toEqual([rfcPath, specPath]);
    expect(result.files[0]).toMatchObject({
      path: rfcPath,
      before: {
        mode: "100644",
        contentDigest: digestBytes(encoder.encode("whole\n")),
        byteLength: encoder.encode("whole\n").byteLength,
      },
      after: { kind: "absent" },
    });
    const spec = result.files[1]!;
    expect(spec.before).toEqual({
      mode: "100755",
      contentDigest: digestBytes(encoder.encode(input.specText)),
      byteLength: encoder.encode(input.specText).byteLength,
    });
    expect(spec.after).toEqual({
      kind: "file",
      mode: "100755",
      bytes: encoder.encode("\uFEFFintro\r\n## Keep\r\nstay\r\n"),
    });
    expect(spec.removedLocators.map((locator) =>
      locator.kind === "section" ? locator.headingSource : locator.kind))
      .toEqual(["Transfer", "Drop"]);
  });

  it("preserves an explicitly retained empty unit as an empty file", () => {
    const result = planV3ExtractionSourceThinning(fixture("## Transfer\nbody\n"));
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;

    expect(result.files.find(({ path }) => path === specPath)?.after).toEqual({
      kind: "file",
      mode: "100755",
      bytes: new Uint8Array(),
    });
  });

  it("refuses a missing source before deriving any thinning output", () => {
    const input = fixture();
    input.sourceTree[specPath] = { kind: "absent" };

    expect(planV3ExtractionSourceThinning(input)).toMatchObject({
      status: "refused",
      reason: "source-missing",
      locus: specPath,
    });
  });

  it("reports the expected and observed source object kinds", () => {
    const input = fixture();
    const state = input.sourceTree[specPath];
    if (state?.kind !== "object") throw new Error("expected source object fixture");
    input.sourceTree[specPath] = { ...state, objectKind: "symlink", mode: "120000" };

    expect(planV3ExtractionSourceThinning(input)).toEqual({
      status: "refused",
      reason: "source-object",
      locus: specPath,
      evidence: { expected: "blob", actual: "symlink" },
    });
  });

  it("reports the expected and observed source modes", () => {
    const input = fixture();
    const state = input.sourceTree[specPath];
    if (state?.kind !== "object") throw new Error("expected source object fixture");
    input.sourceTree[specPath] = { ...state, mode: "100644" };

    expect(planV3ExtractionSourceThinning(input)).toEqual({
      status: "refused",
      reason: "source-mode",
      locus: specPath,
      evidence: { expected: "100755", actual: "100644" },
    });
  });

  it("reports authenticated and observed source byte facts", () => {
    const input = fixture();
    const state = input.sourceTree[specPath];
    if (state?.kind !== "object") throw new Error("expected source object fixture");
    const changed = encoder.encode("changed\n");
    input.sourceTree[specPath] = { ...state, bytes: changed };
    const expected = input.currentPreflight.sourceArtifactInventory.find(({ path }) => path === specPath);
    if (expected === undefined) throw new Error("expected source inventory fixture");

    expect(planV3ExtractionSourceThinning(input)).toEqual({
      status: "refused",
      reason: "source-bytes",
      locus: specPath,
      evidence: {
        expected: { contentDigest: expected.contentDigest },
        actual: { contentDigest: digestBytes(changed), byteLength: changed.byteLength },
      },
    });
  });

  it("reports authenticated and rescanned source-unit facts", () => {
    const input = fixture();
    const machineUnit = input.completedMap.machine.sourceUnits.find(({ sourcePath }) =>
      sourcePath === specPath);
    const starterUnit = input.currentPreflight.starterMap.machine.sourceUnits.find(({ sourceId }) =>
      sourceId === machineUnit?.sourceId);
    if (machineUnit === undefined || starterUnit === undefined) {
      throw new Error("expected source-unit fixture");
    }
    const expectedDigest = `sha256:${"9".repeat(64)}` as const;
    machineUnit.contentDigest = expectedDigest;
    starterUnit.contentDigest = expectedDigest;
    reidentify(input.completedMap.machine);
    reidentify(input.currentPreflight.starterMap.machine);
    const sourceState = input.sourceTree[specPath];
    if (sourceState?.kind !== "object") throw new Error("expected source object fixture");
    const scan = scanV3DecomposeContent("spec-origin.md", sourceState.bytes);
    if (scan.status !== "scanned") throw new Error(scan.reason);
    const observed = scan.units.find((unit) =>
      v3SourceId({ sourcePath: specPath, sourceLocator: unit.locator }) === machineUnit.sourceId);
    if (observed === undefined) throw new Error("expected rescanned source unit");

    expect(planV3ExtractionSourceThinning(input)).toEqual({
      status: "refused",
      reason: "source-unit",
      locus: specPath,
      evidence: {
        expected: { sourcePath: specPath, contentDigest: expectedDigest },
        actual: {
          sourcePath: specPath,
          contentDigest: digestBytes(observed.bytes),
          byteLength: observed.bytes.byteLength,
        },
      },
    });
  });

  it("threads an admitted source-binding comparison", () => {
    const input = fixture();
    input.completedMap = structuredClone(input.completedMap);
    const actualHead = input.currentPreflight.starterMap.machine.source.head;
    const expectedHead = "f".repeat(40);
    input.completedMap.machine.source.head = expectedHead;
    reidentify(input.completedMap.machine);

    expect(planV3ExtractionSourceThinning(input)).toEqual({
      status: "refused",
      reason: "source-binding:source-head",
      locus: "machine.source.head",
      evidence: { expected: expectedHead, actual: actualHead },
    });
  });

  it("refuses an incomplete allocation map instead of inferring deletion", () => {
    const input = fixture();
    input.completedMap.authoring.sourceAllocations.pop();

    expect(planV3ExtractionSourceThinning(input)).toMatchObject({
      status: "refused",
      reason: "map:authoring-identity",
    });
  });
});

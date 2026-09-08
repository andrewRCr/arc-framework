import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  scanV3DecomposeContent,
} from "../../../src/lib/work-unit/decompose-content.js";
import {
  planV3ExtractionSourceThinning,
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

function fixture(specText = [
  "\uFEFFintro",
  "## Transfer",
  "move 😀",
  "## Keep",
  "stay",
  "## Drop",
  "gone",
  "",
].join("\r\n")) {
  const stored = [
    { path: rfcPath, mode: "100644" as const, bytes: encoder.encode("whole\n") },
    { path: specPath, mode: "100755" as const, bytes: encoder.encode(specText) },
  ];
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
      kind: "active-origin" as const,
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
      sourceAllocations: sourceUnits.map((unit) => {
        const locator = unit.sourceLocator;
        const disposition = locator.kind === "preamble"
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

describe("planV3ExtractionSourceThinning", () => {
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

  it.each([
    ["source-missing", () => ({ kind: "absent" as const })],
    ["source-object", (state: V3RepositoryPlanTree[string]) => (
      state.kind === "object" ? { ...state, objectKind: "symlink", mode: "120000" } : state
    )],
    ["source-mode", (state: V3RepositoryPlanTree[string]) => (
      state.kind === "object" ? { ...state, mode: "100644" } : state
    )],
    ["source-bytes", (state: V3RepositoryPlanTree[string]) => (
      state.kind === "object" ? { ...state, bytes: encoder.encode("changed\n") } : state
    )],
  ] as const)("refuses %s before deriving any thinning output", (reason, mutate) => {
    const input = fixture();
    input.sourceTree[specPath] = mutate(input.sourceTree[specPath]!);

    expect(planV3ExtractionSourceThinning(input)).toMatchObject({
      status: "refused",
      reason,
      locus: specPath,
    });
  });

  it("refuses an incomplete allocation map instead of inferring deletion", () => {
    const input = fixture();
    input.completedMap.authoring.sourceAllocations.pop();

    expect(planV3ExtractionSourceThinning(input)).toMatchObject({
      status: "refused",
      reason: "map",
    });
  });
});

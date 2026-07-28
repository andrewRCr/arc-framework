import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  createV3DecomposeStarterMap,
  parseV3DecomposeCutMap,
  parseV3DecomposeStarterMap,
  v3AllowedPathsDigest,
  v3CutMapDigest,
  v3IncomingEdgeId,
  v3IncomingEdgeInventoryDigest,
  v3OutgoingEdgeId,
  v3OutgoingEdgeInventoryDigest,
  v3PreflightId,
  v3ReceiptId,
  v3SourceArtifactDigest,
  v3SourceId,
  v3SourceInventoryDigest,
  type V3DecomposeCutMap,
  type V3DecomposeMachine,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

function machine(): V3DecomposeMachine {
  const locator = { artifact: "draft-origin.md", kind: "preamble" as const };
  const sourceUnit = {
    sourceId: v3SourceId({ sourcePath: ".arc/active/draft-origin.md", sourceLocator: locator }),
    sourcePath: ".arc/active/draft-origin.md",
    sourceLocator: locator,
    contentDigest: canonicalDigest("content"),
  };
  const incoming = {
    edgeId: v3IncomingEdgeId({ dependent: "consumer", currentTargets: ["origin"] }),
    dependent: "consumer",
    currentTargets: ["origin"],
  };
  const outgoing = {
    edgeId: v3OutgoingEdgeId({ prerequisite: "foundation" }),
    prerequisite: "foundation",
  };
  const facts = {
    source: {
      origin: "origin",
      kind: "started-planning" as const,
      logicalBranch: "plan/origin",
      ref: "refs/heads/plan/origin",
      head: "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    planningProfile: { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
    sourceUnits: [sourceUnit],
    incomingEdges: [incoming],
    outgoingEdges: [outgoing],
  };
  return { preflightId: v3PreflightId(facts), ...facts };
}

function completed(): V3DecomposeCutMap {
  const facts = machine();
  return {
    schemaVersion: 3,
    machine: facts,
    authoring: {
      shape: "symmetric",
      placement: { kind: "cohort", cohort: "origin" },
      destinations: [
        { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
        { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Heavy" },
      ],
      internalEdges: [{ from: "member-a", to: "member-b" }],
      sourceAllocations: [{
        sourceId: facts.sourceUnits[0]!.sourceId,
        ownership: "destination-owned",
        disposition: {
          kind: "target",
          destinationId: "member-a",
          targetLocator: { artifact: "draft-member-a.md", kind: "preamble" },
        },
      }],
      incomingDispositions: [{
        edgeId: facts.incomingEdges[0]!.edgeId,
        disposition: { kind: "replace", replacementTargets: ["member-a"] },
      }],
      outgoingDispositions: [{
        edgeId: facts.outgoingEdges[0]!.edgeId,
        disposition: { kind: "targets", targets: ["member-b"] },
      }],
    },
  };
}

describe("v3 decomposition map schema", () => {
  it("prepopulates every starter author slot without changing machine identity", () => {
    const facts = machine();
    const starter = createV3DecomposeStarterMap(facts);

    expect(starter).not.toBeNull();
    expect(starter?.machine).toEqual(facts);
    expect(starter?.authoring.sourceAllocations).toEqual([{
      sourceId: facts.sourceUnits[0]!.sourceId,
      ownership: { status: "author" },
      disposition: { status: "author" },
    }]);
    expect(parseV3DecomposeStarterMap(starter)).toEqual(starter);
  });

  it("accepts a closed completed map and rejects machine or identity-array tampering", () => {
    const value = completed();
    expect(parseV3DecomposeCutMap(value)).toEqual(value);

    const changedMachine = structuredClone(value);
    changedMachine.machine.source.logicalBranch = "plan/other";
    expect(parseV3DecomposeCutMap(changedMachine)).toBeNull();

    const changedIdentity = structuredClone(value);
    changedIdentity.authoring.sourceAllocations[0]!.sourceId = canonicalDigest("other");
    expect(parseV3DecomposeCutMap(changedIdentity)).toBeNull();
  });

  it("closes the public shape and destination domain", () => {
    const symmetric = completed();
    symmetric.authoring.destinations = [symmetric.authoring.destinations[0]!];
    expect(parseV3DecomposeCutMap(symmetric)).toBeNull();

    const extraction = structuredClone(completed()) as unknown as Record<string, unknown>;
    (extraction.authoring as Record<string, unknown>).shape = "extraction";
    expect(parseV3DecomposeCutMap(extraction)).toBeNull();

    const surviving = structuredClone(completed()) as unknown as Record<string, unknown>;
    (surviving.authoring as { destinations: unknown[] }).destinations.push({
      kind: "surviving-origin",
      destinationId: "origin",
      slug: "origin",
    });
    expect(parseV3DecomposeCutMap(surviving)).toBeNull();
  });

  it("binds every canonical identity to its exact versioned preimage", () => {
    const facts = machine();
    const map = completed();
    expect(v3ReceiptId(facts)).not.toBe(v3ReceiptId({
      ...facts,
      source: { ...facts.source, head: "c".repeat(40) },
    }));
    expect(v3CutMapDigest(map)).not.toBe(v3CutMapDigest({
      ...map,
      authoring: { ...map.authoring, placement: { kind: "direct-member" } },
    }));
    expect(v3SourceInventoryDigest(facts)).not.toBe(v3IncomingEdgeInventoryDigest(facts));
    expect(v3IncomingEdgeInventoryDigest(facts)).not.toBe(v3OutgoingEdgeInventoryDigest(facts));
    expect(v3AllowedPathsDigest(["a.md", "b.md"])).not.toBeNull();
    expect(v3AllowedPathsDigest(["b.md", "a.md"])).toBeNull();
    expect(v3SourceArtifactDigest([{
      path: "a.md",
      objectKind: "blob",
      mode: "100644",
      contentDigest: canonicalDigest("bytes"),
    }])).not.toBe(v3SourceArtifactDigest([{
      path: "a.md",
      objectKind: "blob",
      mode: "100755",
      contentDigest: canonicalDigest("bytes"),
    }]));
  });
});

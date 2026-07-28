import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { validateFinalizedV3Decomposition } from "../../../src/lib/work-unit/validate-v3-decomposition.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

function exactFacts() {
  const { preparation, receipt } = v3DecompositionEvidenceFixture();
  const sourceUnit = preparation.facts.completedMap.machine.sourceUnits[0]!;
  return {
    preparation,
    receipt,
    sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
    sourceArtifactInventory: [{
      path: sourceUnit.sourcePath,
      objectKind: "blob" as const,
      mode: "100644" as const,
      contentDigest: sourceUnit.contentDigest,
    }],
    sourceUnits: preparation.facts.completedMap.machine.sourceUnits,
    sourceAllocations: preparation.facts.completedMap.authoring.sourceAllocations,
    resultBaseHead: preparation.facts.completedMap.machine.resultBase.head,
    candidateOwnership: preparation.facts.candidateOwnership,
    destinationOutputs: receipt.finalized.destinationDigests.map(({ destinationId, outputs }) => ({
      destinationId,
      outputs,
    })),
    incomingEdges: preparation.facts.completedMap.machine.incomingEdges,
    outgoingEdges: preparation.facts.completedMap.machine.outgoingEdges,
    managedPathResults: receipt.finalized.managedPathResults,
    transitionPatch: receipt.finalized.transitionPatch,
    topology: preparation.facts.topology,
    publication: receipt.finalized.publication,
  };
}

describe("validateFinalizedV3Decomposition", () => {
  it("returns canonical authority for exact normalized facts", () => {
    expect(validateFinalizedV3Decomposition(exactFacts())).toMatchObject({
      status: "validated",
      authority: { receipt: { kind: "decompose-receipt", schemaVersion: 3 } },
    });
  });

  it("distinguishes source and allocation inventory mismatches with stable loci", () => {
    const artifact = exactFacts();
    artifact.sourceArtifactInventory = structuredClone(artifact.sourceArtifactInventory);
    artifact.sourceArtifactInventory[0]!.contentDigest = canonicalDigest("wrong artifact");
    expect(validateFinalizedV3Decomposition(artifact)).toEqual({
      status: "mismatch",
      mismatch: { kind: "source", locus: artifact.sourceArtifactInventory[0]!.path },
    });

    const source = exactFacts();
    source.sourceUnits = structuredClone(source.sourceUnits);
    source.sourceUnits[0]!.contentDigest = canonicalDigest("wrong unit");
    expect(validateFinalizedV3Decomposition(source)).toEqual({
      status: "mismatch",
      mismatch: { kind: "source", locus: source.sourceUnits[0]!.sourceId },
    });

    const allocation = exactFacts();
    allocation.sourceAllocations = structuredClone(allocation.sourceAllocations);
    allocation.sourceAllocations[0]!.ownership = "cohort-shared";
    expect(validateFinalizedV3Decomposition(allocation)).toEqual({
      status: "mismatch",
      mismatch: { kind: "allocation", locus: allocation.sourceAllocations[0]!.sourceId },
    });
  });

  it("distinguishes target and dependency binding mismatches with stable entry loci", () => {
    const target = exactFacts();
    target.destinationOutputs = structuredClone(target.destinationOutputs);
    target.destinationOutputs[0]!.outputs[0]!.after = {
      kind: "file",
      mode: "100644",
      contentDigest: canonicalDigest("wrong target"),
    };
    expect(validateFinalizedV3Decomposition(target)).toEqual({
      status: "mismatch",
      mismatch: { kind: "target", locus: target.destinationOutputs[0]!.destinationId },
    });

    const dependency = exactFacts();
    dependency.incomingEdges = structuredClone(dependency.incomingEdges);
    dependency.incomingEdges[0]!.currentTargets = ["other"];
    expect(validateFinalizedV3Decomposition(dependency)).toEqual({
      status: "mismatch",
      mismatch: { kind: "dependency", locus: dependency.incomingEdges[0]!.edgeId },
    });
  });

  it.each([
    ["source", { sourceArtifactDigest: canonicalDigest("wrong") }, { locus: "sourceArtifactDigest" }],
    ["base", { resultBaseHead: "c".repeat(40) }, {}],
    ["ownership", { candidateOwnership: { kind: "not-applicable", protection: "full" } }, {}],
    ["topology", { topology: { facts: [{ kind: "none" }], digest: canonicalDigest("wrong") } }, {}],
    ["publication", { publication: { logicalAnchor: { kind: "direct-member", slug: "other" }, entries: [] } }, {}],
  ] as const)("distinguishes %s mismatch", (kind, change, detail) => {
    expect(validateFinalizedV3Decomposition({ ...exactFacts(), ...change }))
      .toEqual({ status: "mismatch", mismatch: { kind, ...detail } });
  });

  it("distinguishes path, mode, and patch mismatches at the first affected path", () => {
    const path = exactFacts();
    path.managedPathResults = path.managedPathResults.slice(1);
    expect(validateFinalizedV3Decomposition(path)).toEqual({
      status: "mismatch",
      mismatch: {
        kind: "path",
        locus: ".arc/backlog/planned/origin/member-a/meta-member-a.md",
      },
    });

    const mode = exactFacts();
    mode.managedPathResults = structuredClone(mode.managedPathResults);
    const firstModeResult = mode.managedPathResults[0]!;
    if (firstModeResult.after.kind !== "file") throw new Error("expected file result");
    firstModeResult.after.mode = "100755";
    expect(validateFinalizedV3Decomposition(mode)).toEqual({
      status: "mismatch",
      mismatch: { kind: "mode", locus: firstModeResult.path },
    });

    const patch = exactFacts();
    patch.transitionPatch = patch.transitionPatch.slice(1);
    expect(validateFinalizedV3Decomposition(patch)).toEqual({
      status: "mismatch",
      mismatch: {
        kind: "patch",
        locus: ".arc/backlog/planned/origin/member-a/meta-member-a.md",
      },
    });
  });

  it("reports only the deterministic first mismatch", () => {
    expect(validateFinalizedV3Decomposition({
      ...exactFacts(),
      sourceArtifactDigest: canonicalDigest("wrong"),
      resultBaseHead: "c".repeat(40),
    })).toEqual({
      status: "mismatch",
      mismatch: { kind: "source", locus: "sourceArtifactDigest" },
    });
  });
});

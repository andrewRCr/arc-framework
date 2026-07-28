import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { validateFinalizedV3Decomposition } from "../../../src/lib/work-unit/validate-v3-decomposition.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

function exactFacts() {
  const { preparation, receipt } = v3DecompositionEvidenceFixture();
  return {
    preparation,
    receipt,
    sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
    resultBaseHead: preparation.facts.completedMap.machine.resultBase.head,
    candidateOwnership: preparation.facts.candidateOwnership,
    managedPathResults: receipt.finalized.managedPathResults,
    topologyDigest: preparation.facts.topology.digest,
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

  it.each([
    ["source", { sourceArtifactDigest: canonicalDigest("wrong") }],
    ["base", { resultBaseHead: "c".repeat(40) }],
    ["ownership", { candidateOwnership: { kind: "not-applicable", protection: "full" } }],
    ["topology", { topologyDigest: canonicalDigest("wrong") }],
    ["publication", { publication: { logicalAnchor: { kind: "direct-member", slug: "other" }, entries: [] } }],
  ] as const)("distinguishes %s mismatch", (kind, change) => {
    expect(validateFinalizedV3Decomposition({ ...exactFacts(), ...change }))
      .toEqual({ status: "mismatch", mismatch: { kind } });
  });

  it("reports the first mismatched managed path locus", () => {
    const facts = exactFacts();
    facts.managedPathResults = facts.managedPathResults.slice(1);
    expect(validateFinalizedV3Decomposition(facts)).toEqual({
      status: "mismatch",
      mismatch: {
        kind: "path",
        locus: ".arc/backlog/planned/origin/member-a/meta-member-a.md",
      },
    });
  });
});

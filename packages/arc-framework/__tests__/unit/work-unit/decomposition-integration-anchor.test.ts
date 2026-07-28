import { describe, expect, it } from "vitest";

import {
  canonicalize,
} from "../../../src/lib/canonical/canonical-json.js";
import {
  produceDecompositionIntegrationAnchor,
  type DecompositionIntegrationFacts,
} from "../../../src/lib/work-unit/decomposition-integration-anchor.js";
import {
  v3CandidateWorktreeId,
  v3PreparationId,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const PREPARED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);
const MERGE_HEAD = "e".repeat(40);

function facts(
  overrides: Partial<DecompositionIntegrationFacts> = {},
): DecompositionIntegrationFacts {
  const { receipt } = v3DecompositionEvidenceFixture();
  return {
    receipts: [receipt],
    preparedBaseHead: PREPARED_BASE,
    candidateCommit: { head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
    receiptTransitionTree: CANDIDATE_TREE,
    currentBaseHead: CANDIDATE_HEAD,
    landing: {
      kind: "fast-forward",
      beforeHead: PREPARED_BASE,
      resultHead: CANDIDATE_HEAD,
      resultTree: CANDIDATE_TREE,
    },
    ...overrides,
  };
}

describe("produceDecompositionIntegrationAnchor", () => {
  it("produces the same closed authority contract for an exact fast-forward landing", () => {
    const result = produceDecompositionIntegrationAnchor(facts());

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      kind: "decomposition-integration-anchor",
      schemaVersion: 1,
      receiptId: v3DecompositionEvidenceFixture().receipt.receiptId,
      origin: "origin",
      sourceHead: "a".repeat(40),
      preparedBaseHead: PREPARED_BASE,
      candidateCommitHead: CANDIDATE_HEAD,
      candidateCommitTree: CANDIDATE_TREE,
      currentBaseHead: CANDIDATE_HEAD,
      landedCommitHead: CANDIDATE_HEAD,
      landedTree: CANDIDATE_TREE,
      landing: { kind: "fast-forward" },
      claimRetirement: { kind: "not-applicable", protection: "partial" },
    });
  });

  it("produces the same contract shape for an exact two-parent merge landing", () => {
    const result = produceDecompositionIntegrationAnchor(facts({
      currentBaseHead: MERGE_HEAD,
      landing: {
        kind: "merge",
        resultHead: MERGE_HEAD,
        resultTree: CANDIDATE_TREE,
        parents: [PREPARED_BASE, CANDIDATE_HEAD],
      },
    }));

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      kind: "decomposition-integration-anchor",
      preparedBaseHead: PREPARED_BASE,
      candidateCommitHead: CANDIDATE_HEAD,
      currentBaseHead: MERGE_HEAD,
      landedCommitHead: MERGE_HEAD,
      landedTree: CANDIDATE_TREE,
      landing: { kind: "merge" },
    });
    expect(Object.keys(result.anchor).sort()).toEqual(Object.keys(
      (produceDecompositionIntegrationAnchor(facts()) as Extract<
        ReturnType<typeof produceDecompositionIntegrationAnchor>,
        { status: "resolved" }
      >).anchor,
    ).sort());
  });

  it("copies the full-protection claim identity byte-for-byte from the receipt", () => {
    const fixture = v3DecompositionEvidenceFixture();
    const claimed = {
      kind: "claimed" as const,
      protection: "full" as const,
      claimId: "claim-origin",
      generation: 7,
      candidateBranch: "decompose/origin",
      candidateWorktree: v3CandidateWorktreeId("claim-origin", 7),
    };
    fixture.receipt.prepared.candidateOwnership = claimed;
    fixture.receipt.preparationId = v3PreparationId({
      receiptId: fixture.receipt.receiptId,
      planId: fixture.receipt.prepared.prospectiveProjection.overlay.planId,
      resultBaseHead: fixture.receipt.prepared.completedMap.machine.resultBase.head,
      sourceArtifactDigest: fixture.receipt.prepared.sourceArtifactDigest,
      sourceInventoryDigest: fixture.receipt.prepared.sourceInventoryDigest,
      incomingEdgeInventoryDigest: fixture.receipt.prepared.incomingEdgeInventoryDigest,
      outgoingEdgeInventoryDigest: fixture.receipt.prepared.outgoingEdgeInventoryDigest,
      cutMapDigest: fixture.receipt.prepared.cutMapDigest,
      allowedPathsDigest: fixture.receipt.prepared.allowedPathsDigest,
      candidateOwnership: claimed,
      candidatePublication: fixture.receipt.prepared.candidatePublication,
      topologyDigest: fixture.receipt.prepared.topology.digest,
      destinationOutputPaths: fixture.receipt.prepared.destinationOutputPaths,
      prospectiveProjection: fixture.receipt.prepared.prospectiveProjection,
    });

    const result = produceDecompositionIntegrationAnchor({
      ...facts(),
      receipts: [fixture.receipt],
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(canonicalize(result.anchor.claimRetirement)).toBe(canonicalize({
      kind: "required",
      protection: "full",
      claimId: claimed.claimId,
      generation: claimed.generation,
      candidateBranch: claimed.candidateBranch,
      candidateWorktree: claimed.candidateWorktree,
    }));
  });

  it("returns absent when no canonical authority is supplied", () => {
    expect(produceDecompositionIntegrationAnchor(facts({ receipts: [] }))).toEqual({
      status: "absent",
    });
  });

  it("returns not-landed without an exact landing relation", () => {
    expect(produceDecompositionIntegrationAnchor(facts({
      landing: { kind: "not-landed" },
    }))).toEqual({ status: "not-landed" });
  });

  it("refuses a moved configured base, including descendant-only mobility", () => {
    const result = produceDecompositionIntegrationAnchor(facts({
      currentBaseHead: "f".repeat(40),
    }));
    expect(result).toEqual({ status: "stale", reason: "current-base" });
  });

  it("refuses a moved candidate commit", () => {
    const result = produceDecompositionIntegrationAnchor(facts({
      candidateCommit: { head: "f".repeat(40), tree: CANDIDATE_TREE },
    }));
    expect(result).toEqual({ status: "stale", reason: "candidate-commit" });
  });

  it("refuses a candidate tree not bound to the receipt transition", () => {
    const result = produceDecompositionIntegrationAnchor(facts({
      receiptTransitionTree: "f".repeat(40),
    }));
    expect(result).toEqual({ status: "refused", reason: "transition-tree" });
  });

  it("returns ambiguous without selecting among distinct receipt authorities", () => {
    const fixture = v3DecompositionEvidenceFixture();
    expect(produceDecompositionIntegrationAnchor(facts({
      receipts: [fixture.receipt, structuredClone(fixture.receipt)],
    }))).toEqual({ status: "ambiguous" });
  });

  it("returns ambiguous for a landing topology that does not identify one result", () => {
    expect(produceDecompositionIntegrationAnchor(facts({
      landing: { kind: "ambiguous" },
    }))).toEqual({ status: "ambiguous" });
  });
});

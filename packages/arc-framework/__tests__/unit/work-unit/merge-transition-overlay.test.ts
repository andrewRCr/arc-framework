import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import {
  selectMergeTransitionOverlay,
  type PinnedMergeValidationFacts,
} from "../../../src/lib/work-unit/merge-transition-overlay.js";
import type { FinalizedV3DecompositionFacts } from "../../../src/lib/work-unit/validate-v3-decomposition.js";
import { v3DecomposeReceiptPath } from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const HEAD_OID = "1".repeat(40);
const MERGE_HEAD_OID = "2".repeat(40);
const CONFIGURED_BASE_OID = "b".repeat(40);
const CANDIDATE_TREE_OID = "4".repeat(40);

function exactFacts(
  options: Parameters<typeof v3DecompositionEvidenceFixture>[0] = {},
): FinalizedV3DecompositionFacts {
  const { preparation, receipt } = v3DecompositionEvidenceFixture(options);
  const sourceUnit = preparation.facts.completedMap.machine.sourceUnits[0]!;
  return {
    preparation,
    receipt,
    sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
    sourceArtifactInventory: [{
      path: sourceUnit.sourcePath,
      objectKind: "blob",
      mode: "100644",
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

function exactSnapshot(): {
  snapshot: PinnedMergeValidationFacts;
  receipt: ReturnType<typeof v3DecompositionEvidenceFixture>["receipt"];
} {
  const validationFacts = exactFacts();
  const receipt = validationFacts.receipt as ReturnType<
    typeof v3DecompositionEvidenceFixture
  >["receipt"];
  return {
    receipt,
    snapshot: {
      operation: {
        kind: "merge",
        headOid: HEAD_OID,
        mergeHeadOids: [MERGE_HEAD_OID],
        configuredBase: { ref: "refs/heads/main", oid: CONFIGURED_BASE_OID },
        candidateTreeOid: CANDIDATE_TREE_OID,
      },
      refs: [{ ref: "refs/heads/main", oid: CONFIGURED_BASE_OID }],
      candidateChangedPaths: [
        ...receipt.finalized.transitionPatch.map(({ path }) => path),
        v3DecomposeReceiptPath(receipt.receiptId),
      ].sort(),
      candidates: [{
        receiptBytes: canonicalize(receipt),
        receiptPath: v3DecomposeReceiptPath(receipt.receiptId),
        derivedCandidateTreeOid: CANDIDATE_TREE_OID,
        provenance: [
          { kind: "candidate-tree" },
          { kind: "head", commitOid: HEAD_OID },
        ],
        validationFacts,
      }],
    },
  };
}

describe("selectMergeTransitionOverlay", () => {
  it("selects one canonical candidate-tree derivation without performing I/O", () => {
    const { snapshot, receipt } = exactSnapshot();

    expect(selectMergeTransitionOverlay(snapshot)).toMatchObject({
      status: "selected",
      receiptId: receipt.receiptId,
      overlay: {
        kind: "validated",
        origin: "origin",
        sourceBranch: "plan/origin",
      },
      provenance: [
        { kind: "candidate-tree" },
        { kind: "head", commitOid: HEAD_OID },
      ],
    });
  });

  it("deduplicates one derivation inherited through multiple operation parents", () => {
    const { snapshot, receipt } = exactSnapshot();
    const candidate = snapshot.candidates[0]!;
    snapshot.candidates = [
      candidate,
      {
        ...candidate,
        provenance: [
          { kind: "candidate-tree" },
          { kind: "merge-head", index: 0, commitOid: MERGE_HEAD_OID },
        ],
      },
    ];

    expect(selectMergeTransitionOverlay(snapshot)).toMatchObject({
      status: "selected",
      receiptId: receipt.receiptId,
      provenance: [
        { kind: "candidate-tree" },
        { kind: "head", commitOid: HEAD_OID },
        { kind: "merge-head", index: 0, commitOid: MERGE_HEAD_OID },
      ],
    });
  });

  it("refuses a merge snapshot with a malformed pinned object identity", () => {
    const { snapshot } = exactSnapshot();
    if (snapshot.operation.kind !== "merge") throw new Error("expected merge fixture");
    snapshot.operation = {
      ...snapshot.operation,
      headOid: "not-an-object-id",
    };
    snapshot.candidates = snapshot.candidates.map((candidate) => ({
      ...candidate,
      provenance: candidate.provenance.map((entry) =>
        entry.kind === "head" ? { ...entry, commitOid: "not-an-object-id" } : entry),
    }));

    expect(selectMergeTransitionOverlay(snapshot)).toEqual({
      status: "refused",
      reason: "invalid-snapshot",
    });
  });

  it("refuses receipt authority derived from a different result base", () => {
    const { snapshot } = exactSnapshot();
    if (snapshot.operation.kind !== "merge") throw new Error("expected merge fixture");
    snapshot.operation = {
      ...snapshot.operation,
      configuredBase: {
        ...snapshot.operation.configuredBase,
        oid: "3".repeat(40),
      },
    };
    snapshot.refs = [{
      ref: snapshot.operation.configuredBase.ref,
      oid: snapshot.operation.configuredBase.oid,
    }];

    expect(selectMergeTransitionOverlay(snapshot)).toEqual({
      status: "refused",
      reason: "invalid-authority",
    });
  });

  it("returns no partial overlay when any candidate-tree authority is invalid", () => {
    const { snapshot } = exactSnapshot();
    const invalid = structuredClone(snapshot.candidates[0]!);
    invalid.validationFacts.resultBaseHead = "9".repeat(40);
    snapshot.candidates = [...snapshot.candidates, invalid];

    expect(selectMergeTransitionOverlay(snapshot)).toEqual({
      status: "refused",
      reason: "invalid-authority",
    });
  });

  it("ignores inherited historical receipts that do not derive the candidate tree", () => {
    const { snapshot, receipt } = exactSnapshot();
    const current = snapshot.candidates[0]!;
    const historicalFacts = exactFacts({ sourceHead: "e".repeat(40) });
    snapshot.candidates = [
      current,
      {
        receiptBytes: canonicalize(historicalFacts.receipt),
        receiptPath: v3DecomposeReceiptPath(
          (historicalFacts.receipt as typeof receipt).receiptId,
        ),
        derivedCandidateTreeOid: CANDIDATE_TREE_OID,
        provenance: [
          { kind: "candidate-tree" },
          { kind: "head", commitOid: HEAD_OID },
        ],
        validationFacts: historicalFacts,
      },
    ];

    expect(selectMergeTransitionOverlay(snapshot)).toMatchObject({
      status: "selected",
      receiptId: receipt.receiptId,
    });
  });

  it("refuses a candidate delta containing two distinct receipt derivations", () => {
    const { snapshot } = exactSnapshot();
    const competingFacts = exactFacts({ origin: "other-origin" });
    const competingReceipt = competingFacts.receipt as ReturnType<
      typeof v3DecompositionEvidenceFixture
    >["receipt"];
    const competingReceiptPath = v3DecomposeReceiptPath(competingReceipt.receiptId);
    snapshot.candidateChangedPaths = [
      ...snapshot.candidateChangedPaths,
      competingReceiptPath,
    ].sort();
    snapshot.candidates = [
      ...snapshot.candidates,
      {
        receiptBytes: canonicalize(competingReceipt),
        receiptPath: competingReceiptPath,
        derivedCandidateTreeOid: CANDIDATE_TREE_OID,
        provenance: [
          { kind: "candidate-tree" },
          { kind: "merge-head", index: 0, commitOid: MERGE_HEAD_OID },
        ],
        validationFacts: competingFacts,
      },
    ];

    expect(selectMergeTransitionOverlay(snapshot)).toEqual({
      status: "refused",
      reason: "invalid-authority",
    });
  });
});

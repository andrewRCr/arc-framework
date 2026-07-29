import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import {
  deriveDecompositionLocalCleanupEligibility,
} from "../../../src/lib/work-unit/decomposition-local-cleanup.js";
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

function request(overrides: Partial<{
  origin: string;
  branch: string;
  head: string;
  locality: "local" | "remote";
}> = {}) {
  return {
    origin: "origin",
    branch: "plan/origin",
    head: "a".repeat(40),
    locality: "local" as const,
    ...overrides,
  };
}

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

describe("deriveDecompositionLocalCleanupEligibility", () => {
  it("exposes local-only cleanup from the shared fast-forward anchor without revalidation", () => {
    const selection = produceDecompositionIntegrationAnchor(facts());
    const result = deriveDecompositionLocalCleanupEligibility(selection, request());

    expect(selection.status).toBe("resolved");
    expect(result.status).toBe("eligible");
    if (selection.status !== "resolved" || result.status !== "eligible") return;
    expect(canonicalize(result.cleanup.integrationAnchor)).toBe(canonicalize(selection.anchor));
    expect(result.cleanup).toMatchObject({
      kind: "decomposition-local-cleanup",
      schemaVersion: 1,
      subject: { kind: "work-unit", name: "origin" },
      source: { branch: "plan/origin", head: "a".repeat(40) },
      claimRetirement: { kind: "not-applicable", protection: "partial" },
      local: { branch: true, worktree: true, userWorkspace: true },
      remote: { kind: "not-authorized" },
    });
  });

  it("carries the exact full-protection claim arm from a shared merge anchor", () => {
    const fixture = v3DecompositionEvidenceFixture();
    const claimed = {
      kind: "claimed" as const,
      protection: "full" as const,
      claimId: "claim-origin",
      generation: 7,
      candidateBranch: "chore/decompose-origin",
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
    const mergeHead = "e".repeat(40);
    const selection = produceDecompositionIntegrationAnchor(facts({
      receipts: [fixture.receipt],
      currentBaseHead: mergeHead,
      landing: {
        kind: "merge",
        resultHead: mergeHead,
        resultTree: CANDIDATE_TREE,
        parents: [PREPARED_BASE, CANDIDATE_HEAD],
      },
    }));

    const result = deriveDecompositionLocalCleanupEligibility(selection, request());

    expect(result.status).toBe("eligible");
    if (result.status !== "eligible") return;
    expect(result.cleanup).toMatchObject({
      integrationAnchor: { landing: { kind: "merge" } },
      claimRetirement: {
        kind: "required",
        protection: "full",
        claimId: claimed.claimId,
        generation: claimed.generation,
        candidateBranch: claimed.candidateBranch,
        candidateWorktree: claimed.candidateWorktree,
      },
    });
  });

  it.each([
    [
      "candidate-only",
      produceDecompositionIntegrationAnchor(facts({ receipts: [] })),
      request(),
      "anchor-unavailable",
    ],
    [
      "finalized-uncommitted",
      produceDecompositionIntegrationAnchor(facts({ landing: { kind: "not-landed" } })),
      request(),
      "anchor-unavailable",
    ],
    [
      "other branch",
      produceDecompositionIntegrationAnchor(facts()),
      request({ branch: "feat/other" }),
      "branch-mismatch",
    ],
    [
      "unlanded",
      { status: "not-landed" as const },
      request(),
      "anchor-unavailable",
    ],
    [
      "base moved (including descendant-base-only)",
      produceDecompositionIntegrationAnchor(facts({ currentBaseHead: "f".repeat(40) })),
      request(),
      "anchor-unavailable",
    ],
    [
      "candidate moved",
      produceDecompositionIntegrationAnchor(facts({
        candidateCommit: { head: "f".repeat(40), tree: CANDIDATE_TREE },
      })),
      request(),
      "anchor-unavailable",
    ],
    [
      "invalid",
      produceDecompositionIntegrationAnchor(facts({ receipts: [{}] })),
      request(),
      "anchor-unavailable",
    ],
    [
      "ambiguous",
      produceDecompositionIntegrationAnchor(facts({
        receipts: [
          v3DecompositionEvidenceFixture().receipt,
          v3DecompositionEvidenceFixture().receipt,
        ],
      })),
      request(),
      "anchor-unavailable",
    ],
    [
      "remote-only",
      produceDecompositionIntegrationAnchor(facts()),
      request({ locality: "remote" }),
      "remote-not-authorized",
    ],
  ] as const)("refuses %s evidence without cleanup authority", (
    _label,
    selection,
    cleanupRequest,
    reason,
  ) => {
    expect(deriveDecompositionLocalCleanupEligibility(selection, cleanupRequest)).toEqual({
      status: "ineligible",
      reason,
    });
  });

  it.each([
    ["origin", request({ origin: "other" }), "origin-mismatch"],
    ["source head", request({ head: "f".repeat(40) }), "head-mismatch"],
  ] as const)("binds the exact %s from the anchor", (_label, cleanupRequest, reason) => {
    expect(deriveDecompositionLocalCleanupEligibility(
      produceDecompositionIntegrationAnchor(facts()),
      cleanupRequest,
    )).toEqual({ status: "ineligible", reason });
  });
});

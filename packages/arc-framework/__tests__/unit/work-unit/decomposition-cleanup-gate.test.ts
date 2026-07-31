import { describe, expect, it } from "vitest";

import {
  canonicalDigest,
  canonicalize,
} from "../../../src/lib/canonical/canonical-json.js";
import {
  authorizeDecompositionCleanup,
  releaseDecompositionCleanupRegistration,
} from "../../../src/lib/work-unit/decomposition-cleanup-gate.js";
import {
  produceDecompositionIntegrationAnchor,
  type DecompositionIntegrationFacts,
} from "../../../src/lib/work-unit/decomposition-integration-anchor.js";
import {
  createDecomposeTransientClaimStore,
  type DecomposeTransientClaimStoreDeps,
} from "../../../src/lib/work-unit/decompose-transient-claim-store.js";
import {
  decomposeTransientClaimId,
} from "../../../src/lib/work-unit/decompose-transient-claim.js";
import {
  v3PreparationId,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const PREPARED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);
const SOURCE_HEAD = "a".repeat(40);
const CANDIDATE_BRANCH = "chore/decompose-origin";
const WORKTREE_PATH = "/repo/worktrees/decompose-origin";

function memoryStore() {
  const files = new Map<string, string>();
  const deps: DecomposeTransientClaimStoreDeps = {
    root: "/repo/.git/arc/transient-claims",
    read: async (path) => files.get(path) ?? null,
    list: async (root) => [...files.keys()]
      .filter((path) => path.startsWith(`${root}/`))
      .map((path) => path.slice(root.length + 1)),
    writeAtomic: async (path, value) => {
      files.set(path, value);
    },
    withLock: async (_path, operation) => await operation(),
  };
  return { store: createDecomposeTransientClaimStore(deps), files };
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
    baseDescent: { kind: "exact" },
    landingRelation: { kind: "exact" },
    landing: {
      kind: "fast-forward",
      beforeHead: PREPARED_BASE,
      resultHead: CANDIDATE_HEAD,
      resultTree: CANDIDATE_TREE,
    },
    ...overrides,
  };
}

async function occupiedFullSelection(descendant = false) {
  const fixture = v3DecompositionEvidenceFixture();
  const binding = {
    origin: "origin",
    candidateBranch: CANDIDATE_BRANCH,
    sourceHead: SOURCE_HEAD,
    resultBaseHead: PREPARED_BASE,
    cutMapDigest: fixture.receipt.prepared.cutMapDigest,
  };
  const claimId = decomposeTransientClaimId(binding);
  const { store, files } = memoryStore();
  const acquired = await store.acquire(claimId, binding);
  if (acquired.status !== "acquired") throw new Error("expected acquired claim");
  await store.reserve(claimId, acquired.claim.generation, WORKTREE_PATH);
  const occupied = await store.occupy(claimId, acquired.claim.generation, WORKTREE_PATH, {
    registrations: [{
      path: WORKTREE_PATH,
      candidateBranch: CANDIDATE_BRANCH,
      head: PREPARED_BASE,
    }],
    branch: { candidateBranch: CANDIDATE_BRANCH, head: PREPARED_BASE },
    marker: {
      claimId,
      generation: acquired.claim.generation,
      candidateWorktree: acquired.claim.candidateWorktree,
    },
  });
  if (occupied.status !== "occupied") throw new Error("expected occupied claim");
  const claimed = {
    kind: "claimed" as const,
    protection: "full" as const,
    claimId,
    generation: occupied.claim.generation,
    candidateBranch: CANDIDATE_BRANCH,
    candidateWorktree: occupied.claim.candidateWorktree,
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
  const selection = produceDecompositionIntegrationAnchor(facts({
    receipts: [fixture.receipt],
    ...(descendant
      ? {
        currentBaseHead: "f".repeat(40),
        baseDescent: {
          kind: "descendant" as const,
          from: CANDIDATE_HEAD,
          to: "f".repeat(40),
        },
      }
      : {}),
  }));
  if (selection.status !== "resolved") throw new Error("expected resolved anchor");
  return { selection, store, files, claimId };
}

const request = {
  origin: "origin",
  branch: "plan/origin",
  head: SOURCE_HEAD,
  locality: "local" as const,
};

describe("decomposition cleanup gate", () => {
  it("retires one exact full-protection generation before granting cleanup and retries idempotently", async () => {
    const { selection, store, claimId } = await occupiedFullSelection();

    const first = await authorizeDecompositionCleanup(selection, request, store);

    expect(first.status).toBe("authorized");
    if (first.status !== "authorized") return;
    expect(canonicalize(first.authorization.cleanup.integrationAnchor))
      .toBe(canonicalize(selection.anchor));
    expect(first.authorization.retirement).toMatchObject({
      kind: "required",
      outcome: "retired",
      claim: {
        claimId,
        state: {
          kind: "terminal",
          terminal: {
            kind: "landed",
            receiptId: selection.anchor.receiptId,
            candidateHead: selection.anchor.candidateCommitHead,
          },
        },
      },
    });

    const retry = await authorizeDecompositionCleanup(selection, request, store);
    expect(retry).toMatchObject({
      status: "authorized",
      authorization: {
        retirement: { kind: "required", outcome: "already-retired-matching" },
      },
    });
  });

  it("grants exact partial-protection cleanup without a claim mutation when the namespace is clear", async () => {
    const selection = produceDecompositionIntegrationAnchor(facts());
    const { store, files } = memoryStore();

    const result = await authorizeDecompositionCleanup(selection, request, store);

    expect(result).toMatchObject({
      status: "authorized",
      authorization: {
        cleanup: {
          claimRetirement: { kind: "not-applicable", protection: "partial" },
        },
        retirement: { kind: "not-applicable", protection: "partial" },
      },
    });
    expect(files.size).toBe(0);
  });

  it("preserves full and partial claim retirement behavior for descendant-derived anchors", async () => {
    const full = await occupiedFullSelection(true);
    expect(await authorizeDecompositionCleanup(full.selection, request, full.store)).toMatchObject({
      status: "authorized",
      authorization: { retirement: { kind: "required", outcome: "retired" } },
    });

    const descendantHead = "f".repeat(40);
    const partial = produceDecompositionIntegrationAnchor(facts({
      currentBaseHead: descendantHead,
      baseDescent: { kind: "descendant", from: CANDIDATE_HEAD, to: descendantHead },
    }));
    const clear = memoryStore();
    expect(await authorizeDecompositionCleanup(partial, request, clear.store)).toMatchObject({
      status: "authorized",
      authorization: { retirement: { kind: "not-applicable", protection: "partial" } },
    });
    expect(clear.files.size).toBe(0);
  });

  it("releases only the exact terminal registration after successful local cleanup", async () => {
    const { selection, store, claimId } = await occupiedFullSelection();
    const authorized = await authorizeDecompositionCleanup(selection, request, store);
    if (authorized.status !== "authorized") throw new Error("expected cleanup authorization");

    const released = await releaseDecompositionCleanupRegistration(
      authorized.authorization,
      {
        status: "completed",
        releaseEvidence: {
          registrationAbsent: true,
          markerAbsent: true,
          branchOccupationAbsent: true,
        },
      },
      store,
    );

    expect(released).toMatchObject({
      status: "released",
      outcome: "released",
      claim: {
        claimId,
        generation: 1,
        registration: { kind: "released", lastPath: WORKTREE_PATH },
      },
    });

    const retryAuthorization = await authorizeDecompositionCleanup(selection, request, store);
    if (retryAuthorization.status !== "authorized") throw new Error("expected retry authorization");
    expect(await releaseDecompositionCleanupRegistration(
      retryAuthorization.authorization,
      {
        status: "completed",
        releaseEvidence: {
          registrationAbsent: true,
          markerAbsent: true,
          branchOccupationAbsent: true,
        },
      },
      store,
    )).toMatchObject({
      status: "released",
      outcome: "already-released-matching",
      claim: { generation: 1 },
    });
  });

  it("refuses stale, discarded, missing, and failed full-claim CAS without leaking cleanup authority", async () => {
    const concurrent = await occupiedFullSelection();
    const staleSelection = structuredClone(concurrent.selection);
    if (staleSelection.anchor.claimRetirement.kind !== "required") {
      throw new Error("expected required claim retirement");
    }
    staleSelection.anchor.claimRetirement.generation += 1;
    expect(await authorizeDecompositionCleanup(staleSelection, request, concurrent.store)).toEqual({
      status: "refused",
      reason: "claim-mismatch",
    });

    const discarded = await occupiedFullSelection();
    await discarded.store.retire(discarded.claimId, 1, {
      kind: "discarded",
      planId: canonicalDigest("discarded-plan"),
      candidateHead: CANDIDATE_HEAD,
    });
    expect(await authorizeDecompositionCleanup(
      discarded.selection,
      request,
      discarded.store,
    )).toEqual({ status: "refused", reason: "claim-conflict" });

    const missing = memoryStore();
    expect(await authorizeDecompositionCleanup(
      (await occupiedFullSelection()).selection,
      request,
      missing.store,
    )).toEqual({ status: "refused", reason: "claim-missing-unproven" });
    expect(missing.files.size).toBe(0);

    const failedCas = await occupiedFullSelection();
    const before = await failedCas.store.read(failedCas.claimId);
    expect(await authorizeDecompositionCleanup(failedCas.selection, request, {
      ...failedCas.store,
      retire: async () => ({ status: "conflict", reason: "generation-mismatch" }),
    })).toEqual({ status: "refused", reason: "claim-conflict" });
    expect(await failedCas.store.read(failedCas.claimId)).toEqual(before);
  });

  it("does not touch a live claim when exact landing validation fails", async () => {
    const live = await occupiedFullSelection();
    const before = [...live.files.entries()];
    const invalid = produceDecompositionIntegrationAnchor(facts({
      landing: { kind: "not-landed" },
    }));

    expect(await authorizeDecompositionCleanup(invalid, request, live.store)).toEqual({
      status: "refused",
      reason: "anchor-ineligible",
    });
    expect([...live.files.entries()]).toEqual(before);
  });

  it("refuses partial protection when any matching live or terminal generation remains", async () => {
    const partial = produceDecompositionIntegrationAnchor(facts());
    const live = await occupiedFullSelection();
    expect(await authorizeDecompositionCleanup(partial, request, live.store)).toEqual({
      status: "refused",
      reason: "partial-claim-present",
    });

    const terminal = await occupiedFullSelection();
    const authorized = await authorizeDecompositionCleanup(
      terminal.selection,
      request,
      terminal.store,
    );
    if (authorized.status !== "authorized") throw new Error("expected cleanup authorization");
    await releaseDecompositionCleanupRegistration(
      authorized.authorization,
      {
        status: "completed",
        releaseEvidence: {
          registrationAbsent: true,
          markerAbsent: true,
          branchOccupationAbsent: true,
        },
      },
      terminal.store,
    );
    expect(await authorizeDecompositionCleanup(partial, request, terminal.store)).toEqual({
      status: "refused",
      reason: "partial-claim-present",
    });
  });

  it("keeps a terminal registration path-addressable across failed and incomplete cleanup", async () => {
    const { selection, store, claimId } = await occupiedFullSelection();
    const authorized = await authorizeDecompositionCleanup(selection, request, store);
    if (authorized.status !== "authorized") throw new Error("expected cleanup authorization");

    expect(await releaseDecompositionCleanupRegistration(
      authorized.authorization,
      { status: "failed" },
      store,
    )).toEqual({ status: "preserved", reason: "cleanup-incomplete" });
    expect(await releaseDecompositionCleanupRegistration(
      authorized.authorization,
      {
        status: "completed",
        releaseEvidence: {
          registrationAbsent: true,
          markerAbsent: false,
          branchOccupationAbsent: true,
        },
      },
      store,
    )).toEqual({ status: "preserved", reason: "release-conflict" });
    expect(await store.read(claimId)).toMatchObject({
      status: "found",
      claim: {
        generation: 1,
        state: { kind: "terminal", terminal: { kind: "landed" } },
        registration: { kind: "registered", path: WORKTREE_PATH },
      },
    });
    expect(await authorizeDecompositionCleanup(selection, request, store)).toMatchObject({
      status: "authorized",
      authorization: {
        retirement: {
          kind: "required",
          outcome: "already-retired-matching",
          claim: { generation: 1 },
        },
      },
    });
  });

  it("fails closed on malformed partial claim state and never routes partial release through the store", async () => {
    const selection = produceDecompositionIntegrationAnchor(facts());
    const malformed = memoryStore();
    const partialClaimId = decomposeTransientClaimId({
      origin: "origin",
      candidateBranch: CANDIDATE_BRANCH,
    });
    malformed.files.set(
      `/repo/.git/arc/transient-claims/${partialClaimId}.json`,
      "{not canonical",
    );
    expect(await authorizeDecompositionCleanup(selection, request, malformed.store)).toEqual({
      status: "refused",
      reason: "partial-claim-unproven",
    });

    const clear = memoryStore();
    const authorized = await authorizeDecompositionCleanup(selection, request, clear.store);
    if (authorized.status !== "authorized") throw new Error("expected partial authorization");
    expect(await releaseDecompositionCleanupRegistration(
      authorized.authorization,
      {
        status: "completed",
        releaseEvidence: {
          registrationAbsent: false,
          markerAbsent: false,
          branchOccupationAbsent: false,
        },
      },
      clear.store,
    )).toEqual({ status: "not-applicable" });
    expect(clear.files.size).toBe(0);
  });
});

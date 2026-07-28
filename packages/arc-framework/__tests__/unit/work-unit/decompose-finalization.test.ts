import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  finalizeDecomposeRetirement,
  finalizeV3DecomposeRetirement,
  resolveV3DecomposeFinalizationTransition,
  type V3DecomposeFinalizationContext,
} from "../../../src/lib/work-unit/decompose-finalization.js";
import { createV3DecomposeReceipt } from "../../../src/lib/work-unit/decompose-v3-receipt.js";
import { validateFinalizedV3Decomposition } from "../../../src/lib/work-unit/validate-v3-decomposition.js";

describe("retired v1/v2 decomposition finalization boundary", () => {
  it("refuses legacy evidence instead of emitting a generic receipt", async () => {
    expect(await finalizeDecomposeRetirement(
      {} as never,
      {} as never,
      "legacy-authority",
    )).toEqual({ status: "refused", reason: "unsupported-transition" });
  });
});

describe("v3 decomposition finalization boundary", () => {
  type EvidenceFacts = Awaited<
    ReturnType<V3DecomposeFinalizationContext["readEvidence"]>
  >["facts"];

  function fixtureFacts() {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    const machine = preparation.facts.completedMap.machine;
    const authoring = preparation.facts.completedMap.authoring;
    const sourceUnit = machine.sourceUnits[0]!;
    return {
      preparation,
      receipt,
      facts: {
        preparation,
        receipt,
        sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
        sourceArtifactInventory: [{
          path: sourceUnit.sourcePath,
          objectKind: "blob" as const,
          mode: "100644" as const,
          contentDigest: sourceUnit.contentDigest,
        }],
        sourceUnits: machine.sourceUnits,
        sourceAllocations: authoring.sourceAllocations,
        resultBaseHead: machine.resultBase.head,
        candidateOwnership: preparation.facts.candidateOwnership,
        destinationOutputs: receipt.finalized.destinationDigests.map(
          ({ destinationId, outputs }) => ({ destinationId, outputs }),
        ),
        incomingEdges: machine.incomingEdges,
        outgoingEdges: machine.outgoingEdges,
        managedPathResults: receipt.finalized.managedPathResults,
        transitionPatch: receipt.finalized.transitionPatch,
        topology: preparation.facts.topology,
        publication: receipt.finalized.publication,
      },
    };
  }

  function fixtureContext(): {
    ctx: V3DecomposeFinalizationContext;
    readStored(): string;
    writes(): number;
  } {
    const { preparation, facts } = fixtureFacts();
    let stored = canonicalize(preparation);
    let writeCount = 0;
    return {
      ctx: {
        readEvidence: async () => ({
          authorityVersion: "authority-v1",
          parentRecord: null,
          indexRecord: stored,
          worktreeRecord: stored,
          facts,
        }),
        validateProspectiveProjection: async () => true,
        replaceAndStageRecord: async (_receiptId, expected, next) => {
          if (stored !== expected) throw new Error("compare-and-set failed");
          stored = next;
          writeCount += 1;
        },
      },
      readStored: () => stored,
      writes: () => writeCount,
    };
  }

  it("returns one receipt-bound payload for recorded, already-finalized, and refreshed", () => {
    const { preparation, receipt, facts } = fixtureFacts();
    const validation = validateFinalizedV3Decomposition(facts);
    if (validation.status !== "validated") throw new Error("fixture must validate");
    const prior = createV3DecomposeReceipt(
      preparation,
      receipt.finalized.managedPathResults,
      receipt.finalized.destinationDigests.map(
        ({ destinationId, outputs }) => ({ destinationId, outputs }),
      ),
      { kind: "none" },
    );
    if (prior === null) throw new Error("prior receipt must be canonical");

    const recorded = resolveV3DecomposeFinalizationTransition({
      validation,
      parentRecord: null,
      indexRecord: canonicalize(preparation),
      worktreeRecord: canonicalize(preparation),
    });
    const alreadyFinalized = resolveV3DecomposeFinalizationTransition({
      validation,
      parentRecord: null,
      indexRecord: canonicalize(receipt),
      worktreeRecord: canonicalize(receipt),
    });
    const refreshed = resolveV3DecomposeFinalizationTransition({
      validation,
      parentRecord: null,
      indexRecord: canonicalize(prior),
      worktreeRecord: canonicalize(prior),
      refresh: { status: "authorized", priorReceipt: prior },
    });

    expect(recorded).toMatchObject({ status: "recorded", mutation: { kind: "replace" } });
    expect(alreadyFinalized).toMatchObject({ status: "already-finalized", mutation: { kind: "none" } });
    expect(refreshed).toMatchObject({ status: "refreshed", mutation: { kind: "replace" } });
    const payload = (result: typeof recorded) => {
      if (result.status === "refused") throw new Error("fixture transition must succeed");
      return {
        receipt: result.receipt,
        authorityVersion: result.authorityVersion,
        transitionOverlay: result.transitionOverlay,
        lifecycle: result.lifecycle,
      };
    };
    expect(payload(alreadyFinalized)).toEqual(payload(recorded));
    expect(payload(refreshed)).toEqual(payload(recorded));
  });

  it.each([
    ["preparation", "preparation", "recorded"],
    ["receipt", "receipt", "already-finalized"],
    ["preparation", "receipt", "record-state-mismatch:index-worktree"],
    ["receipt", "preparation", "record-state-mismatch:index-worktree"],
    ["absent", "preparation", "record-state-mismatch:index"],
    ["preparation", "absent", "record-state-mismatch:worktree"],
    ["absent", "receipt", "record-state-mismatch:index"],
    ["receipt", "absent", "record-state-mismatch:worktree"],
    ["absent", "absent", "record-state-mismatch:index"],
  ] as const)(
    "maps absent-parent %s/%s projections to %s",
    (indexKind, worktreeKind, expected) => {
      const { preparation, receipt, facts } = fixtureFacts();
      const validation = validateFinalizedV3Decomposition(facts);
      const record = (kind: typeof indexKind): string | null =>
        kind === "preparation"
          ? canonicalize(preparation)
          : kind === "receipt" ? canonicalize(receipt) : null;
      const result = resolveV3DecomposeFinalizationTransition({
        validation,
        parentRecord: null,
        indexRecord: record(indexKind),
        worktreeRecord: record(worktreeKind),
      });
      const actual = result.status === "refused"
        ? `${result.refusal.code}:${
          "locus" in result.refusal ? result.refusal.locus : ""
        }`.replace(/:$/u, "")
        : result.status;
      expect(actual).toBe(expected);
    },
  );

  it.each(["preparation", "receipt", "invalid"] as const)(
    "refuses a committed parent %s before considering index/worktree status",
    (parentKind) => {
      const { preparation, receipt, facts } = fixtureFacts();
      const validation = validateFinalizedV3Decomposition(facts);
      const parentRecord = parentKind === "preparation"
        ? canonicalize(preparation)
        : parentKind === "receipt" ? canonicalize(receipt) : "{}";
      expect(resolveV3DecomposeFinalizationTransition({
        validation,
        parentRecord,
        indexRecord: canonicalize(receipt),
        worktreeRecord: canonicalize(receipt),
      })).toEqual({
        status: "refused",
        refusal: { code: "candidate-parent-record", locus: "parent" },
      });
    },
  );

  it("atomically replaces one exact preparation with validated finalized authority", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const harness = fixtureContext();
    const result = await finalizeV3DecomposeRetirement(
      harness.ctx,
      receipt,
      "authority-v1",
    );
    expect(result.status).toBe("recorded");
    expect(harness.readStored()).toBe(canonicalize(receipt));
    expect(harness.writes()).toBe(1);
  });

  it("returns already-finalized with the same authority and performs zero retry writes", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const harness = fixtureContext();
    const recorded = await finalizeV3DecomposeRetirement(harness.ctx, receipt, "authority-v1");
    const retried = await finalizeV3DecomposeRetirement(harness.ctx, receipt, "authority-v1");

    expect(recorded).toMatchObject({ status: "recorded" });
    expect(retried).toEqual({ ...recorded, status: "already-finalized" });
    expect(harness.readStored()).toBe(canonicalize(receipt));
    expect(harness.writes()).toBe(1);
  });

  it("refuses prospective projection drift before replacing preparation", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const harness = fixtureContext();
    harness.ctx.validateProspectiveProjection = async () => false;

    expect(await finalizeV3DecomposeRetirement(
      harness.ctx,
      receipt,
      "authority-v1",
    )).toEqual({
      status: "refused",
      reason: "projection-mismatch",
      diagnostic: "prospective-projection-mismatch",
    });
    expect(harness.writes()).toBe(0);
  });

  it("returns no authority and performs no write for stored or live drift", async () => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();

    const authorityConflict = fixtureContext();
    const readAuthorityConflict = authorityConflict.ctx.readEvidence;
    authorityConflict.ctx.readEvidence = async (...args) => ({
      ...await readAuthorityConflict(...args),
      authorityVersion: "changed-authority",
    });
    expect(await finalizeV3DecomposeRetirement(
      authorityConflict.ctx,
      receipt,
      "wrong-authority",
    )).toMatchObject({ status: "refused", reason: "authority-conflict" });
    expect(authorityConflict.writes()).toBe(0);

    const storedDrift = fixtureContext();
    const readStoredDrift = storedDrift.ctx.readEvidence;
    storedDrift.ctx.readEvidence = async (...args) => {
      const evidence = await readStoredDrift(...args);
      const changed = canonicalize({
        ...preparation,
        preparationId: "sha256:".concat("0".repeat(64)),
      });
      return { ...evidence, indexRecord: changed, worktreeRecord: changed };
    };
    expect(await finalizeV3DecomposeRetirement(
      storedDrift.ctx,
      receipt,
      "authority-v1",
    )).toMatchObject({ status: "refused", reason: "evidence-mismatch" });
    expect(storedDrift.writes()).toBe(0);

    for (const mutate of [
      (facts: EvidenceFacts) => {
        facts.sourceUnits = structuredClone(facts.sourceUnits);
        facts.sourceUnits[0]!.contentDigest = canonicalDigest("changed source unit");
      },
      (facts: EvidenceFacts) => {
        facts.sourceAllocations = structuredClone(facts.sourceAllocations);
        facts.sourceAllocations[0]!.ownership = "cohort-shared";
      },
      (facts: EvidenceFacts) => {
        facts.destinationOutputs = structuredClone(facts.destinationOutputs);
        facts.destinationOutputs[0]!.outputs[0]!.after = { kind: "absent" };
      },
      (facts: EvidenceFacts) => {
        facts.incomingEdges = structuredClone(facts.incomingEdges);
        facts.incomingEdges[0]!.currentTargets = ["other"];
      },
      (facts: EvidenceFacts) => {
        facts.candidateOwnership = { kind: "not-applicable", protection: "full" };
      },
      (facts: EvidenceFacts) => {
        facts.topology = {
          facts: [{ kind: "none" }],
          digest: "sha256:".concat("1".repeat(64)),
        };
      },
      (facts: EvidenceFacts) => {
        facts.publication = { kind: "none" };
      },
      (facts: EvidenceFacts) => {
        facts.managedPathResults = facts.managedPathResults.slice(1);
      },
      (facts: EvidenceFacts) => {
        facts.managedPathResults = structuredClone(facts.managedPathResults);
        const after = facts.managedPathResults[0]!.after;
        if (after.kind !== "file") throw new Error("expected file");
        after.mode = "100755";
      },
      (facts: EvidenceFacts) => {
        facts.transitionPatch = facts.transitionPatch.slice(1);
      },
    ]) {
      const liveDrift = fixtureContext();
      const originalRead = liveDrift.ctx.readEvidence;
      liveDrift.ctx.readEvidence = async (...args) => {
        const evidence = await originalRead(...args);
        mutate(evidence.facts);
        return evidence;
      };
      expect(await finalizeV3DecomposeRetirement(
        liveDrift.ctx,
        receipt,
        "authority-v1",
      )).toMatchObject({ status: "refused", reason: "evidence-mismatch" });
      expect(liveDrift.writes()).toBe(0);
    }
  });
});

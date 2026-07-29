import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  finalizeDecomposeRetirement,
  finalizeV3DecomposeRetirement,
  type V3DecomposeFinalizationContext,
} from "../../../src/lib/work-unit/decompose-finalization.js";

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
  function fixtureContext(): {
    ctx: V3DecomposeFinalizationContext;
    readStored(): string;
    writes(): number;
  } {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    const machine = preparation.facts.completedMap.machine;
    const authoring = preparation.facts.completedMap.authoring;
    const sourceUnit = machine.sourceUnits[0]!;
    let stored = canonicalize(preparation);
    let writeCount = 0;
    return {
      ctx: {
        readAuthoritySnapshot: async () => ({
          authorityVersion: "authority-v1",
          recordState: "prepared-decompose",
        }),
        readRecord: async () => stored,
        readFinalizedFacts: async () => ({
          preparation,
          receipt,
          sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
          sourceArtifactInventory: [{
            path: sourceUnit.sourcePath,
            objectKind: "blob",
            mode: "100644",
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
        }),
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

  it("returns no authority when the evidence adapter throws", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const harness = fixtureContext();
    harness.ctx.readFinalizedFacts = async () => {
      throw new Error("evidence read failed");
    };

    expect(await finalizeV3DecomposeRetirement(
      harness.ctx,
      receipt,
      "authority-v1",
    )).toEqual({
      status: "refused",
      reason: "authority-unavailable",
      diagnostic: "evidence read failed",
    });
    expect(harness.writes()).toBe(0);
  });
  it("returns no authority and performs no write for stored or live drift", async () => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();

    const authorityConflict = fixtureContext();
    expect(await finalizeV3DecomposeRetirement(
      authorityConflict.ctx,
      receipt,
      "wrong-authority",
    )).toMatchObject({ status: "refused", reason: "authority-conflict" });
    expect(authorityConflict.writes()).toBe(0);

    const storedDrift = fixtureContext();
    storedDrift.ctx.readRecord = async () => canonicalize({
      ...preparation,
      preparationId: "sha256:".concat("0".repeat(64)),
    });
    expect(await finalizeV3DecomposeRetirement(
      storedDrift.ctx,
      receipt,
      "authority-v1",
    )).toMatchObject({ status: "refused", reason: "evidence-mismatch" });
    expect(storedDrift.writes()).toBe(0);

    for (const mutate of [
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.sourceUnits = structuredClone(facts.sourceUnits);
        facts.sourceUnits[0]!.contentDigest = canonicalDigest("changed source unit");
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.sourceAllocations = structuredClone(facts.sourceAllocations);
        facts.sourceAllocations[0]!.ownership = "cohort-shared";
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.destinationOutputs = structuredClone(facts.destinationOutputs);
        facts.destinationOutputs[0]!.outputs[0]!.after = { kind: "absent" };
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.incomingEdges = structuredClone(facts.incomingEdges);
        facts.incomingEdges[0]!.currentTargets = ["other"];
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.candidateOwnership = { kind: "not-applicable", protection: "full" };
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.topology = {
          facts: [{ kind: "none" }],
          digest: "sha256:".concat("1".repeat(64)),
        };
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.publication = { kind: "none" };
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.managedPathResults = facts.managedPathResults.slice(1);
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.managedPathResults = structuredClone(facts.managedPathResults);
        const after = facts.managedPathResults[0]!.after;
        if (after.kind !== "file") throw new Error("expected file");
        after.mode = "100755";
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.transitionPatch = facts.transitionPatch.slice(1);
      },
    ]) {
      const liveDrift = fixtureContext();
      const originalRead = liveDrift.ctx.readFinalizedFacts;
      liveDrift.ctx.readFinalizedFacts = async (...args) => {
        const facts = await originalRead(...args);
        mutate(facts);
        return facts;
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

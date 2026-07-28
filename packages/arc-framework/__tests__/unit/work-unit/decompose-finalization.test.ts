import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
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
          resultBaseHead: preparation.facts.completedMap.machine.resultBase.head,
          candidateOwnership: preparation.facts.candidateOwnership,
          managedPathResults: receipt.finalized.managedPathResults,
          topologyDigest: preparation.facts.topology.digest,
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
        facts.candidateOwnership = { kind: "not-applicable", protection: "full" };
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.topologyDigest = "sha256:".concat("1".repeat(64));
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.publication = { kind: "none" };
      },
      (facts: Awaited<ReturnType<V3DecomposeFinalizationContext["readFinalizedFacts"]>>) => {
        facts.managedPathResults = facts.managedPathResults.slice(1);
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

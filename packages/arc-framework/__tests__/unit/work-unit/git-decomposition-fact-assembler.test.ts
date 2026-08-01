import { describe, expect, it, vi } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  assembleGitFinalizedV3DecompositionFacts,
  type GitDecompositionFactAssemblerDependencies,
} from "../../../src/lib/work-unit/git-decomposition-fact-assembler.js";
import type { V3DecomposeTreeSnapshot } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const bytes = new TextEncoder().encode("source unit");
const { preparation, receipt } = v3DecompositionEvidenceFixture({
  digestLabel: (label) => digestBytes(new TextEncoder().encode(label)),
});
const machine = preparation.facts.completedMap.machine;

function sourceSnapshot(): V3DecomposeTreeSnapshot {
  return {
    ref: machine.source.ref,
    head: machine.source.head,
    origins: [{
      path: ".arc/active/meta-origin.md",
      origin: "origin",
      location: "active",
      state: "Planning",
      branch: "plan/origin",
      design: ["draft-origin.md"],
      taskList: null,
    }],
    sourceArtifacts: [{
      path: ".arc/active/draft-origin.md",
      objectKind: "blob",
      mode: "100644",
      bytes,
    }],
    incomingEdges: [{ dependent: "consumer", currentTargets: ["origin"] }],
    outgoingEdges: [],
  };
}

function baseSnapshot(): V3DecomposeTreeSnapshot {
  return {
    ref: machine.resultBase.ref,
    head: machine.resultBase.head,
    origins: [],
    sourceArtifacts: [],
    incomingEdges: [],
    outgoingEdges: [],
  };
}

function dependencies(): GitDecompositionFactAssemblerDependencies {
  return {
    readSnapshot: vi.fn(async (ref, head) =>
      ref === machine.source.ref && head === machine.source.head
        ? sourceSnapshot()
        : baseSnapshot()),
    readPathState: vi.fn(async (ref, path) => {
      const expected = receipt.finalized.managedPathResults.find((entry) => entry.path === path)!;
      return ref === machine.resultBase.head ? expected.before : expected.after;
    }),
  };
}

describe("Git decomposition fact assembler", () => {
  it("re-derives source, base, candidate, and destination facts from their committed trees", async () => {
    const deps = dependencies();

    const result = await assembleGitFinalizedV3DecompositionFacts(
      receipt,
      "c".repeat(40),
      deps,
    );

    expect(result).toMatchObject({
      status: "assembled",
      facts: {
        sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
        sourceUnits: machine.sourceUnits,
        incomingEdges: machine.incomingEdges,
        outgoingEdges: machine.outgoingEdges,
        destinationOutputs: receipt.finalized.destinationDigests.map(({ destinationId, outputs }) => ({
          destinationId,
          outputs,
        })),
      },
    });
    expect(deps.readSnapshot).toHaveBeenCalledWith(machine.source.ref, machine.source.head, "origin");
    expect(deps.readSnapshot).toHaveBeenCalledTimes(1);
    for (const { path } of receipt.finalized.managedPathResults) {
      expect(deps.readPathState).toHaveBeenCalledWith(machine.resultBase.head, path);
      expect(deps.readPathState).toHaveBeenCalledWith("c".repeat(40), path);
    }
  });

  it("distinguishes unreadable tree state from source-content mismatch", async () => {
    await expect(assembleGitFinalizedV3DecompositionFacts(receipt, "c".repeat(40), {
      ...dependencies(),
      readPathState: vi.fn(async () => false as const),
    })).resolves.toMatchObject({ status: "unreadable" });

    const validSource = sourceSnapshot();
    const invalidSource: V3DecomposeTreeSnapshot = {
      ...validSource,
      origins: [{ ...validSource.origins[0]!, branch: "plan/other" }],
    };
    await expect(assembleGitFinalizedV3DecompositionFacts(receipt, "c".repeat(40), {
      ...dependencies(),
      readSnapshot: vi.fn(async (ref) => ref === machine.source.ref ? invalidSource : baseSnapshot()),
    })).resolves.toMatchObject({
      status: "mismatch",
      mismatch: { kind: "source" },
    });
  });
});

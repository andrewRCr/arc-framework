import { describe, expect, it } from "vitest";

import {
  mapV3DecomposeFinalizationRecovery,
  renderV3DecomposeFinalizationRecovery,
  type V3DecomposeRecoveryFacts,
} from "../../../src/lib/work-unit/decompose-finalization-recovery.js";
import type { V3DecompositionMismatchKind } from "../../../src/lib/work-unit/validate-v3-decomposition.js";

const receiptId = `sha256:${"a".repeat(64)}` as const;
const facts: V3DecomposeRecoveryFacts = {
  finalizeInvocation: {
    provenance: "finalize-command",
    origin: "origin",
    receiptId,
    continuationPath: "/tmp/continuation.json",
  },
  executeInvocation: {
    provenance: "execute-command",
    origin: "origin",
    cutMapPath: "/tmp/cut-map.json",
  },
  candidate: {
    provenance: "candidate-driver",
    branch: "feat/origin-decompose",
    generation: 3,
  },
};

const mismatchActions: Record<V3DecompositionMismatchKind, "re-preflight" | "reauthor"> = {
  preparation: "re-preflight",
  receipt: "re-preflight",
  source: "re-preflight",
  allocation: "re-preflight",
  base: "re-preflight",
  ownership: "re-preflight",
  target: "reauthor",
  dependency: "reauthor",
  path: "reauthor",
  mode: "reauthor",
  patch: "reauthor",
  topology: "reauthor",
  publication: "reauthor",
};

describe("v3 decompose finalization recovery", () => {
  it.each(Object.entries(mismatchActions) as Array<
    [V3DecompositionMismatchKind, "re-preflight" | "reauthor"]
  >)(
    "maps canonical %s mismatch to %s using only its authorized fact arm",
    (kind, action) => {
      const result = mapV3DecomposeFinalizationRecovery({
        cause: { kind: "canonical-mismatch", mismatch: { kind, locus: "untrusted-locus" } },
        facts,
      });
      expect(result.action).toBe(action);
      expect(result.establishedFacts).not.toHaveProperty("cutMapPath");
      expect(result.establishedFacts).not.toHaveProperty("candidateBranch");
      expect(canonicalText(result)).not.toContain("untrusted-locus");
    },
  );

  it("emits retry and discard only from exact invocation and candidate facts", () => {
    expect(mapV3DecomposeFinalizationRecovery({
      cause: { kind: "transient-finalization" },
      facts,
    })).toMatchObject({
      action: "retry",
      establishedFacts: {
        provenance: "finalize-command",
        origin: "origin",
        receiptId,
        continuationPath: "/tmp/continuation.json",
      },
    });
    expect(mapV3DecomposeFinalizationRecovery({
      cause: { kind: "discardable-candidate" },
      facts,
    })).toMatchObject({
      action: "discard",
      establishedFacts: {
        origin: "origin",
        cutMapPath: "/tmp/cut-map.json",
        candidateBranch: "feat/origin-decompose",
        candidateGeneration: 3,
      },
    });
  });

  it.each([
    {
      cause: { kind: "transient-finalization" as const },
      facts: {},
      missing: "receipt",
    },
    {
      cause: { kind: "discardable-candidate" as const },
      facts: { executeInvocation: facts.executeInvocation },
      missing: "candidate",
    },
    {
      cause: { kind: "discardable-candidate" as const },
      facts: { candidate: facts.candidate },
      missing: "cut-map",
    },
    {
      cause: {
        kind: "canonical-mismatch" as const,
        mismatch: { kind: "publication" as const },
      },
      facts: {},
      missing: "receipt",
    },
  ])("downgrades missing $missing authority to prose guidance", ({ cause, facts: partialFacts }) => {
    const result = mapV3DecomposeFinalizationRecovery({ cause, facts: partialFacts });
    expect(result.action).toBe("guidance");
    expect(renderV3DecomposeFinalizationRecovery(result)).not.toContain("<");
    expect(renderV3DecomposeFinalizationRecovery(result)).not.toContain("undefined");
  });

  it("renders the mapper result without reconstructing policy", () => {
    const recovery = mapV3DecomposeFinalizationRecovery({
      cause: { kind: "transient-finalization" },
      facts,
    });
    expect(renderV3DecomposeFinalizationRecovery(recovery)).toBe(
      `Retry: arc decompose origin --finalize ${receiptId} --continuation /tmp/continuation.json`,
    );
  });
});

function canonicalText(value: unknown): string {
  return JSON.stringify(value);
}

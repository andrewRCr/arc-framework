import { describe, expect, it } from "vitest";

import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import {
  describeTeardownAuthorizationRefusal,
  retirementSubjectRefusal,
  validateReceiptMatrix,
  worktreeSubjectsEqual,
  type DecomposeAllocationMap,
  type RetirementReceipt,
  type TeardownAuthorizationRefusal,
} from "../../../src/lib/work-unit/retirement-authority.js";

const digest = (value: string) => contentDigest(new TextEncoder().encode(value));

const refusalDescriptions = {
  "unsupported-transition": "unsupported transition",
  "evidence-missing": "retirement evidence is missing",
  "evidence-mismatch": "retirement evidence does not match the requested transition",
  "projection-mismatch": "the live branch projection does not match the request",
  "conservation-unproven": "content conservation is not proven",
  "preservation-unproven": "preservation is not proven",
  "authority-unavailable": "retirement authority is unavailable",
  "authority-ambiguous": "retirement authority found conflicting evidence",
  "authority-conflict": "retirement authority changed during the operation",
} as const satisfies Record<TeardownAuthorizationRefusal, string>;

function receipt(overrides: Partial<RetirementReceipt> = {}): RetirementReceipt {
  return {
    schemaVersion: 1,
    receiptId: digest("receipt"),
    subject: { kind: "work-unit", name: "sample" },
    transition: "abandon",
    source: {
      branch: "plan/sample",
      head: "a".repeat(40),
      artifactDigest: digest("source"),
    },
    transitionPatchDigest: digest("patch"),
    retiringProjection: { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: { kind: "discard", artifactDigest: "absent" },
    ...overrides,
  };
}

describe("TeardownAuthorizationRefusal", () => {
  it("is handled exhaustively by the runtime renderer", () => {
    for (const [reason, description] of Object.entries(refusalDescriptions)) {
      expect(describeTeardownAuthorizationRefusal(reason as TeardownAuthorizationRefusal)).toBe(description);
    }
  });
});

describe("worktree subject identity", () => {
  it("keeps work-unit, errand, and branch subjects distinct when their text suffixes match", () => {
    const workUnit = { kind: "work-unit", name: "shared" } as const;
    const errand = { kind: "errand", slug: "shared" } as const;
    const branch = { kind: "branch", ref: "shared" } as const;

    expect(worktreeSubjectsEqual(workUnit, workUnit)).toBe(true);
    expect(worktreeSubjectsEqual(workUnit, errand)).toBe(false);
    expect(worktreeSubjectsEqual(workUnit, branch)).toBe(false);
    expect(worktreeSubjectsEqual(errand, branch)).toBe(false);
  });

  it("refuses the reserved errand subject until an errand retirement driver exists", () => {
    expect(retirementSubjectRefusal({ kind: "errand", slug: "shared" })).toBe("unsupported-transition");
    expect(retirementSubjectRefusal({ kind: "work-unit", name: "shared" })).toBeNull();
    expect(retirementSubjectRefusal({ kind: "branch", ref: "chore/shared" })).toBeNull();
  });
});

describe("receipt cross-field matrix", () => {
  it.each([
    [receipt(), "nonexistent"],
    [
      receipt({
        transition: "decompose",
        result: {
          kind: "decompose",
          preparationId: digest("prep"),
          allocation: { schemaVersion: 2 } as DecomposeAllocationMap,
          cutMapDigest: digest("cut-map"),
          sourceInventoryDigest: digest("source-inventory"),
          incomingEdgeInventoryDigest: digest("incoming-inventory"),
          outgoingEdgeInventoryDigest: digest("outgoing-inventory"),
          targets: [],
        },
      }),
      "nonexistent",
    ],
    [
      receipt({
        transition: "park-planning",
        authorization: "planning-relocated",
        result: { kind: "relocate", plannedArtifactDigest: digest("planned") },
      }),
      "planned",
    ],
  ] as const)("accepts the fixed %s combination", (candidate, expectedLifecycle) => {
    expect(validateReceiptMatrix(candidate, expectedLifecycle)).toBeNull();
  });

  it.each([
    [receipt(), "planned"],
    [receipt({ authorization: "planning-relocated" }), "nonexistent"],
    [receipt({ result: { kind: "relocate", plannedArtifactDigest: digest("planned") } }), "nonexistent"],
    [receipt({ transition: "decompose" }), "nonexistent"],
    [receipt({ transition: "park-planning" }), "planned"],
  ] as const)("rejects an unsupported cross-field combination", (candidate, expectedLifecycle) => {
    expect(validateReceiptMatrix(candidate, expectedLifecycle)).toBe("evidence-mismatch");
  });
});

import { describe, expect, it } from "vitest";

import {
  classifyReviewApplicability,
  ReviewApplicabilityIdPreimageSchema,
  ReviewApplicabilityProofSchema,
  validateIncrementalApplicabilityReceipt,
} from "../../../../../src/scripts/review-gate/core/applicability.js";
import type { ReviewReceiptV2 } from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";

const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

describe("review applicability", () => {
  it("normalizes canonical change paths and classifies disjoint and interacting deltas", () => {
    const common = {
      priorTargetId: digest("1"),
      currentTargetId: digest("2"),
      changeSetId: digest("3"),
      reviewedPaths: ["src/z.ts", "src/a.ts", "src/a.ts"],
      changeSet: {
        changeSet: "known" as const,
        changes: [{
          status: "renamed" as const,
          previousPath: "docs/old.md",
          path: "docs/new.md",
          oldMode: "100644" as const,
          newMode: "100644" as const,
        }],
      },
      conflictState: "none" as const,
    };
    const carry = classifyReviewApplicability(common);
    const incremental = classifyReviewApplicability({
      ...common,
      changeSet: {
        changeSet: "known",
        changes: [{
          status: "modified",
          path: "src/a.ts",
          oldMode: "100644",
          newMode: "100644",
        }],
      },
    });

    expect(carry).toMatchObject({
      reviewedPaths: ["src/a.ts", "src/z.ts"],
      deltaPaths: ["docs/new.md", "docs/old.md"],
      interactionPaths: [],
      treatment: "carry",
    });
    expect(incremental).toMatchObject({
      deltaPaths: ["src/a.ts"],
      interactionPaths: ["src/a.ts"],
      treatment: "incremental",
    });
    expect(incremental.applicabilityId).toBe(
      "sha256:184ebda057f23d88761ddabf09eb117435cceef65bb0b7779fdc99d0adebc275",
    );
    expect(classifyReviewApplicability({
      ...common,
      reviewedPaths: [...common.reviewedPaths].reverse(),
      changeSet: incremental.deltaPaths.length === 1 ? {
        changeSet: "known",
        changes: [{
          status: "modified",
          path: "src/a.ts",
          oldMode: "100644",
          newMode: "100644",
        }],
      } : common.changeSet,
    }).applicabilityId).toBe(incremental.applicabilityId);
  });

  it("binds incremental receipt coverage to the exact proof intersection or complete delta", () => {
    const proof = classifyReviewApplicability({
      priorTargetId: digest("1"),
      currentTargetId: digest("2"),
      changeSetId: digest("3"),
      reviewedPaths: ["src/a.ts"],
      changeSet: {
        changeSet: "known",
        changes: [{ status: "modified", path: "src/a.ts", oldMode: "100644", newMode: "100755" }],
      },
      conflictState: "none",
    });
    const receipt = { applicabilityId: proof.applicabilityId } as ReviewReceiptV2;

    expect(validateIncrementalApplicabilityReceipt(proof, receipt, ["src/a.ts"])).toBe(true);
    expect(validateIncrementalApplicabilityReceipt(proof, { ...receipt, applicabilityId: null }, ["src/a.ts"]))
      .toBe(false);
  });

  it("forces conflict resolution to incremental even without an ordinary path intersection", () => {
    expect(classifyReviewApplicability({
      priorTargetId: digest("1"),
      currentTargetId: digest("2"),
      changeSetId: digest("3"),
      reviewedPaths: ["src/a.ts"],
      changeSet: {
        changeSet: "known",
        changes: [{ status: "added", path: "src/b.ts", oldMode: "000000", newMode: "100644" }],
      },
      conflictState: "resolved",
    })).toMatchObject({ treatment: "incremental", interactionPaths: [], deltaPaths: ["src/b.ts"] });
  });

  it("rejects unknown changes and ambient, self-ID, omitted, null, or non-normalized proof inputs", () => {
    const base = {
      priorTargetId: digest("1"),
      currentTargetId: digest("2"),
      changeSetId: digest("3"),
      reviewedPaths: ["src/a.ts"],
      changeSet: { changeSet: "unknown" as const, changes: [] as [] },
      conflictState: "none" as const,
    };
    expect(() => classifyReviewApplicability(base)).toThrow(/unknown change set/u);
    expect(() => classifyReviewApplicability({ ...base, applicabilityId: digest("4") } as never)).toThrow();
    expect(() => classifyReviewApplicability({ ...base, conflictState: null } as never)).toThrow();
    const proof = classifyReviewApplicability({
      ...base,
      changeSet: {
        changeSet: "known",
        changes: [{ status: "modified", path: "src/a.ts", oldMode: "100644", newMode: "100755" }],
      },
    });
    const missingConflict = Object.fromEntries(
      Object.entries(proof).filter(([key]) => key !== "conflictState"),
    );
    expect(() => ReviewApplicabilityProofSchema.parse(missingConflict)).toThrow();
    expect(() => ReviewApplicabilityProofSchema.parse({
      ...proof,
      reviewedPaths: ["src/z.ts", "src/a.ts"],
    })).toThrow(/sorted and unique/u);
    expect(() => ReviewApplicabilityIdPreimageSchema.parse({
      domain: "arc.review-gate.applicability-id/v2",
      ...proof,
    })).toThrow(/unrecognized key/iu);
  });
});

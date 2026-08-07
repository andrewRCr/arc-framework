/** Exact public result contract for Errand promotion. */

import { describe, expect, it } from "vitest";

import {
  createErrandPromotionResult,
  ErrandPromotionResultSchema,
} from "../../../src/lib/errand/promotion-result.js";

const CLAIM_ID = "c".repeat(32);
const GENERATION = `errand-v1/growing/${CLAIM_ID}`;

describe("ErrandPromotionResultSchema", () => {
  it("carries exact commit-required settlement without retired locus aliases", () => {
    const result = createErrandPromotionResult({
      outcome: "applied",
      operation: "errand-promote",
      subject: { kind: "errand", slug: "growing", claimId: CLAIM_ID },
      generation: GENERATION,
      branch: "feat/growth",
      metaPath: ".arc/active/meta-growth.md",
      checkoutPath: "/repo",
      allocation: "primary",
      parentCheckoutPath: null,
      settlement: {
        state: "commit-required",
        identity: "retained",
        originEntry: null,
        originEntrySourceDigest: null,
      },
      recommendedPromptText: "Commit the meta and replay.",
    });

    expect(ErrandPromotionResultSchema.parse(result)).toEqual(result);
    for (const retired of ["recordId", "leaseId", "activeLocusPath", "sessionHomePath"] as const) {
      expect(ErrandPromotionResultSchema.safeParse({ ...result, [retired]: null }).success).toBe(false);
    }
  });

  it("retains structured exact-generation foreign confirmation", () => {
    const result = createErrandPromotionResult({
      outcome: "confirmation-required",
      operation: "errand-promote",
      subject: { kind: "errand", slug: "growing", claimId: CLAIM_ID },
      checkoutPath: "/repo/growing",
      generation: GENERATION,
      destructiveEffect: "convert this Errand into a work unit",
      recommendedPromptText: `Retry with generation ${GENERATION}`,
    });

    expect(ErrandPromotionResultSchema.parse(result)).toEqual(result);
  });
});

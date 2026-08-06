/** Public Errand terminal result boundaries. */

import { describe, expect, it } from "vitest";

import { ErrandTerminalResultSchema } from "../../../src/lib/errand/terminal-result.js";

const SUBJECT = { kind: "errand", slug: "repair", claimId: "a".repeat(32) } as const;
const GENERATION = `errand-v1/${SUBJECT.slug}/${SUBJECT.claimId}`;

describe("Errand terminal results", () => {
  it("carries the exact foreign authority evidence in a typed confirmation result", () => {
    const result = {
      outcome: "confirmation-required",
      operation: "errand-close",
      subject: SUBJECT,
      checkoutPath: "/repo/repair",
      generation: GENERATION,
      destructiveEffect: "close and retire this Errand",
      recommendedPromptText: `Retry with: arc errand close repair --confirm-foreign-generation ${GENERATION}`,
    };

    expect(ErrandTerminalResultSchema.parse(result)).toEqual(result);
  });

  it("returns terminal settlement evidence without retired locus identifiers or aliases", () => {
    const result = {
      outcome: "applied",
      operation: "errand-close",
      subject: SUBJECT,
      generation: GENERATION,
      checkoutPath: "/repo/repair",
      parentCheckoutPath: "/repo",
      settlement: { kind: "capture", disposition: "removed", originEntry: "Repair capture" },
      nextOffer: null,
      recommendedPromptText: "Closed Errand 'repair'.",
    };

    expect(ErrandTerminalResultSchema.parse(result)).toEqual(result);
    for (const retired of ["recordId", "leaseId", "activeLocusPath", "sessionHomePath", "restoredParent"]) {
      expect(ErrandTerminalResultSchema.safeParse({ ...result, [retired]: "retired" }).success).toBe(false);
    }
  });

  it("keeps ordinary evidence refusals distinct from foreign confirmation", () => {
    const result = {
      outcome: "refused",
      operation: "errand-leave",
      subject: SUBJECT,
      checkoutPath: "/repo/repair",
      generation: GENERATION,
      reason: "preservation-unproven",
      recommendedPromptText: "The Errand checkout is dirty.",
    };

    expect(ErrandTerminalResultSchema.parse(result)).toEqual(result);
  });
});

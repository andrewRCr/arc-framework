/** Public Errand terminal result boundaries. */

import { describe, expect, it } from "vitest";

import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import {
  adaptErrandTerminalResult,
  ErrandTerminalResultSchema,
} from "../../../src/lib/errand/terminal-result.js";

const SUBJECT = { kind: "errand", slug: "repair", claimId: "a".repeat(32) } as const;
const GENERATION = `errand-v1/${SUBJECT.slug}/${SUBJECT.claimId}`;

describe("Errand terminal results", () => {
  it("carries the exact foreign authority evidence in a typed confirmation result", () => {
    const result = {
      outcome: "confirmation-required",
      operation: "errand-close",
      subject: SUBJECT,
      checkoutPath: null,
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

  it("represents already-terminal replay without inventing a retired generation", () => {
    const result = {
      outcome: "idempotent",
      operation: "errand-abandon",
      subject: null,
      generation: null,
      checkoutPath: null,
      parentCheckoutPath: null,
      settlement: { kind: "capture", disposition: "absent", originEntry: null },
      nextOffer: null,
      recommendedPromptText: "Errand 'repair' is already abandoned.",
    };

    expect(ErrandTerminalResultSchema.parse(result)).toEqual(result);
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

  it("projects internal settlement without leaking retired locus fields", () => {
    const result = adaptErrandTerminalResult({
      result: createLocusMutationResult({
        outcome: "applied",
        operation: "errand-close",
        allocation: null,
        recordId: `sha256:${"b".repeat(64)}`,
        leaseId: null,
        activeLocusPath: null,
        sessionHomePath: "/repo",
        identity: null,
        originEntry: "Repair capture",
        restoredParent: null,
        nextOffer: null,
        recommendedPromptText: "Closed Errand 'repair'.",
      }),
      authority: null,
      evidence: {
        subject: SUBJECT,
        generation: GENERATION,
        checkoutPath: "/repo/repair",
        parentCheckoutPath: "/repo",
        settlement: { kind: "capture", disposition: "removed", originEntry: "Repair capture" },
      },
    });

    expect(result).toEqual({
      outcome: "applied",
      operation: "errand-close",
      subject: SUBJECT,
      generation: GENERATION,
      checkoutPath: "/repo/repair",
      parentCheckoutPath: "/repo",
      settlement: { kind: "capture", disposition: "removed", originEntry: "Repair capture" },
      nextOffer: null,
      recommendedPromptText: "Closed Errand 'repair'.",
    });
  });

  it("preserves an exact authority refusal instead of collapsing it into a legacy reason", () => {
    const result = adaptErrandTerminalResult({
      result: createLocusMutationResult({
        outcome: "refused",
        operation: "errand-close",
        reason: "identity-conflict",
        recommendedPromptText: "The supplied foreign confirmation does not match the current Errand generation.",
      }),
      authority: {
        kind: "refused",
        reason: "generation-mismatch",
        message: "The supplied foreign confirmation does not match the current Errand generation.",
      },
      evidence: null,
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "generation-mismatch" });
  });
});

/** Unit coverage for strict hosted-review Errand authority. */

import { describe, expect, it } from "vitest";

import type { DerivedLocusFrame } from
  "../../../../../src/lib/locus/derived-reader.js";
import { resolveActiveHostedReviewErrand } from
  "../../../../../src/scripts/review-gate/hosted/errand-authority.js";

const BRANCH = "chore/review-errand";

function frame(): DerivedLocusFrame {
  const identity = {
    kind: "errand" as const,
    key: "review-errand",
    claimId: "claim-1",
    protection: "full" as const,
    branch: BRANCH,
    purpose: "errand" as const,
    origin: "description" as const,
    originEntry: null,
    state: "open" as const,
    savedHead: null,
    changeRequest: null,
  };
  const row = {
    checkout: {
      path: "/repo",
      head: "a".repeat(40),
      branch: BRANCH,
      detached: false,
      primary: true,
    },
    markerGeneration: `sha256:${"b".repeat(64)}`,
    parentCheckoutPath: null,
    origin: null,
    identity,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    kind: "transient" as const,
    subject: {
      kind: "errand" as const,
      key: identity.key,
      claimId: identity.claimId,
    },
  };
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: {
      kind: "occupied",
      checkoutPath: "/repo",
      subject: row.subject,
    },
    identityDiscovery: { kind: "complete", identities: [identity], diagnostics: [] },
    active: null,
  };
}

describe("hosted-review Errand authority", () => {
  it("projects the exact active ordinary Errand without work-unit state", () => {
    expect(resolveActiveHostedReviewErrand(frame(), BRANCH)).toEqual({
      key: "review-errand",
      claimId: "claim-1",
      branch: BRANCH,
    });
  });

  it("rejects a contradictory transient identity", () => {
    const current = frame();
    if (current.entering.kind !== "selected" || current.entering.row.identity?.kind !== "errand") {
      throw new Error("invalid test fixture");
    }
    const contradictory = {
      ...current,
      entering: {
        kind: "selected" as const,
        row: {
          ...current.entering.row,
          identity: { ...current.entering.row.identity, claimId: "other-claim" },
        },
      },
    };

    expect(() => resolveActiveHostedReviewErrand(contradictory, BRANCH)).toThrow(/exact active ordinary Errand/u);
  });
});

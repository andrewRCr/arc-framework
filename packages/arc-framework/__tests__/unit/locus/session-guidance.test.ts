/** Session narration over the derived checkout frame. */

import { describe, expect, it } from "vitest";

import {
  deriveDerivedLocusSessionGuidance,
  deriveRecoveryLocusSessionGuidance,
} from "../../../src/lib/locus/session-guidance.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";

function primaryFrame(kind: "free-primary" | "unresolved-checkout"): DerivedLocusFrame {
  const unresolved = kind === "unresolved-checkout";
  const row = {
    kind,
    checkout: {
      path: "/repo",
      head: "a".repeat(40),
      branch: "main",
      detached: false,
      primary: true,
    },
    subject: null,
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: unresolved
      ? [{ code: "subject-unresolved", message: "current meta is unreadable" }]
      : [],
  } as const;
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: unresolved
      ? { kind: "unsafe", checkoutPath: "/repo", reasons: ["subject-unresolved"] }
      : { kind: "free", checkoutPath: "/repo" },
    identityDiscovery: { kind: "absent" },
    active: null,
  };
}

describe("deriveDerivedLocusSessionGuidance", () => {
  it("precomposes an entering-checkout stop from only that row's diagnostics", () => {
    expect(deriveDerivedLocusSessionGuidance({
      ok: true,
      value: primaryFrame("unresolved-checkout"),
    })).toEqual({
      kind: "unavailable",
      message: "Entering checkout /repo is unresolved (subject-unresolved: current meta is unreadable).",
    });
  });

  it("keeps a healthy current row ready when identity discovery alone is unavailable", () => {
    const value: DerivedLocusFrame = {
      ...primaryFrame("free-primary"),
      identityDiscovery: { kind: "error", stage: "tree", message: "identity root unavailable" },
    };

    expect(deriveDerivedLocusSessionGuidance({ ok: true, value })).toMatchObject({
      kind: "ready",
      entering: "free-primary at /repo",
      identityDiscovery: "Transient identity discovery is unavailable at tree: identity root unavailable",
    });
  });

  it("offers cleanup only for retired and unresolved checkout rows", () => {
    const frame = primaryFrame("free-primary");
    const retired = {
      ...frame.roster[0]!,
      kind: "retired" as const,
      checkout: { ...frame.roster[0]!.checkout, path: "/repo/old", primary: false },
      subject: { kind: "work-unit" as const, key: "old" },
    };
    const value: DerivedLocusFrame = { ...frame, roster: [...frame.roster, retired] };

    expect(deriveDerivedLocusSessionGuidance({ ok: true, value })).toMatchObject({
      kind: "ready",
      cleanup: ["Cleanup is available for retired checkout /repo/old."],
    });
  });

  it("does not offer cleanup for an active foreign checkout with Candidate schema skew", () => {
    const frame = primaryFrame("free-primary");
    const skewed = {
      ...frame.roster[0]!,
      kind: "unresolved-checkout" as const,
      checkout: { ...frame.roster[0]!.checkout, path: "/repo/active", primary: false },
      subject: { kind: "work-unit" as const, key: "active" },
      lifecycleLocation: "active" as const,
      diagnostics: [{
        code: "candidate-record-schema-skew",
        message: "Use the checkout-local ARC CLI from /repo/active.",
      }],
    };
    const value: DerivedLocusFrame = { ...frame, roster: [...frame.roster, skewed] };

    expect(deriveDerivedLocusSessionGuidance({ ok: true, value })).toMatchObject({
      kind: "ready",
      cleanup: [],
      diagnostics: [
        "candidate-record-schema-skew at checkout '/repo/active': "
          + "Use the checkout-local ARC CLI from /repo/active.",
      ],
    });
  });
});

describe("deriveRecoveryLocusSessionGuidance", () => {
  it("falls back to the base checkout when a transient parent is unavailable", () => {
    const primary = primaryFrame("free-primary");
    const transient = {
      ...primary.roster[0]!,
      kind: "transient" as const,
      checkout: { ...primary.roster[0]!.checkout, path: "/repo/errand", branch: "chore/fix", primary: false },
      markerGeneration: `sha256:${"b".repeat(64)}`,
      parentCheckoutPath: "/repo/missing-parent",
      subject: { kind: "errand" as const, key: "fix", claimId: "c".repeat(32) },
    };
    const value: DerivedLocusFrame = {
      ...primary,
      roster: [primary.roster[0]!, transient],
      entering: { kind: "selected", row: transient },
    };

    expect(deriveRecoveryLocusSessionGuidance({ ok: true, value })).toMatchObject({
      kind: "ready",
      recovery: "Parent checkout /repo/missing-parent was not found; return to base /repo.",
    });
  });
});

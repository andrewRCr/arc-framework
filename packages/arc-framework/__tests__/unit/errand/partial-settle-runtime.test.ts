/** Partial Errand terminal absence and authority boundaries. */

import { describe, expect, it, vi } from "vitest";

import { settlePartialErrandAtRuntime } from "../../../src/lib/errand/partial-settle-runtime.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

function primaryRow(kind: "free-primary" | "unresolved-checkout" = "free-primary"): DerivedCheckoutRow {
  return {
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
    diagnostics: kind === "free-primary"
      ? []
      : [{ code: "authority-evidence-unreadable", source: "marker", message: "bad marker" }],
  };
}

function frame(primary = primaryRow(), siblings: readonly DerivedCheckoutRow[] = []): DerivedLocusFrame {
  return {
    roster: [primary, ...siblings],
    entering: { kind: "selected", row: primary },
    primaryAvailability: primary.kind === "free-primary"
      ? { kind: "free", checkoutPath: primary.checkout.path }
      : { kind: "unsafe", checkoutPath: primary.checkout.path, reasons: ["unresolved"] },
    identityDiscovery: { kind: "absent" },
    active: null,
  };
}

function unresolvedSibling(): DerivedCheckoutRow {
  return {
    ...primaryRow("unresolved-checkout"),
    checkout: {
      path: "/repo/sibling",
      head: "b".repeat(40),
      branch: "chore/other",
      detached: false,
      primary: false,
    },
  };
}

function options(state: DerivedLocusFrame) {
  return {
    slug: "direct-fix",
    action: "close" as const,
    base: "main",
    exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    readFrame: async () => state,
    settleInbox: vi.fn(async () => ({ kind: "idempotent" as const, nextOffer: null })),
  };
}

describe("partial Errand settlement", () => {
  it("accepts idempotent absence only from the exact current free primary", async () => {
    const result = await settlePartialErrandAtRuntime(options(frame()));
    expect(result).toMatchObject({ outcome: "idempotent" });
  });

  it("contains an unrelated malformed sibling while preserving proven absence", async () => {
    const result = await settlePartialErrandAtRuntime(options(frame(primaryRow(), [unresolvedSibling()])));
    expect(result).toMatchObject({ outcome: "idempotent" });
  });

  it("refuses absence when the current primary marker evidence is unresolved", async () => {
    const result = await settlePartialErrandAtRuntime(options(frame(primaryRow("unresolved-checkout"))));
    expect(result).toMatchObject({ outcome: "refused", reason: "authority-unresolved" });
  });
});

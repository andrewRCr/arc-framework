/** Tier classification coverage over the locus refusal vocabulary. */

import { describe, expect, it } from "vitest";

import { locusStopTier, type LocusStopTier } from "../../../src/lib/locus/stop-tier.js";
import { LocusStopReasonSchema } from "../../../src/lib/locus/schema/state.js";

describe("locus stop tiers", () => {
  it("classifies every published reason into exactly one tier", () => {
    const tiers: LocusStopTier[] = ["hard", "authority", "advisory"];
    for (const reason of LocusStopReasonSchema.options) {
      expect(tiers).toContain(locusStopTier(reason));
    }
  });

  it("keeps a foreign live holder unreleasable", () => {
    expect(locusStopTier("lease-live")).toBe("hard");
    expect(locusStopTier("lock-live")).toBe("hard");
  });

  it("routes unverifiable liveness to operator confirmation rather than a dead end", () => {
    expect(locusStopTier("lease-unknown")).toBe("authority");
    expect(locusStopTier("lock-unknown")).toBe("authority");
  });

  it("routes the recorded stranding case to operator confirmation", () => {
    expect(locusStopTier("subject-unresolved")).toBe("authority");
  });

  it("keeps allocation preconditions off the stop path", () => {
    expect(locusStopTier("primary-dirty")).toBe("advisory");
    expect(locusStopTier("primary-off-base")).toBe("advisory");
  });

  it("never makes an unestablished target releasable", () => {
    for (const reason of ["record-malformed", "unsupported-version", "duplicate-locus",
      "cross-identity", "identity-malformed", "role-conflict"] as const) {
      expect(locusStopTier(reason)).toBe("hard");
    }
  });
});

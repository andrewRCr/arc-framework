import { describe, expect, it } from "vitest";
import { createDefaultLocusPorts, requireMarkerExclusivity } from "../../../src/lib/work-unit/locus-ports.js";

describe("lifecycle locus ports", () => {
  it("keeps the default legacy lookup and leaves anchored markers unadmitted", async () => {
    const ports = createDefaultLocusPorts();
    expect(await ports.findHoldingCheckout({ name: "demo", resolveLegacy: async () => "/legacy-checkout" })).toBe("/legacy-checkout");
    expect(await ports.writeAnchoredMarker("/checkout", { spawnedByArc: false, wuName: "demo", spawningIdentity: "test", createdAt: "2026-01-01T00:00:00.000Z" })).toEqual({ kind: "unadmitted" });
  });
  it("names the holding checkout and the work-or-release repair", async () => {
    const ports = { ...createDefaultLocusPorts(), checkMarkerExclusivity: async () => ({ kind: "refused" as const, checkoutPath: "/holding-checkout", reason: "Already claimed." }) };
    await expect(requireMarkerExclusivity(ports, { name: "demo" })).rejects.toThrow(/holding-checkout.*work there.*arc locus release/u);
  });
});

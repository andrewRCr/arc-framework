import { describe, expect, it } from "vitest";
import { cutMapFixture } from "../../../fixtures/decompose-v4.js";
import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";

describe("cut machine decoding", () => {
  it.each(["sourceUnits", "incomingEdges", "outgoingEdges"] as const)("refuses reordered %s", collection => {
    const value = cutMapFixture();
    value.machine[collection].reverse();
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "machine-order", path: `machine.${collection}` } });
  });
  it.each([
    { path: "machine.sourceUnits.0.sourceId", mutate: (value: ReturnType<typeof cutMapFixture>) => { value.machine.sourceUnits[0]!.sourceLocator.artifact = "changed.md"; } },
    { path: "machine.incomingEdges.0", mutate: (value: ReturnType<typeof cutMapFixture>) => { value.machine.incomingEdges[0]!.dependent.uid = "55555555-5555-4555-8555-555555555555"; } },
    { path: "machine.outgoingEdges.0", mutate: (value: ReturnType<typeof cutMapFixture>) => { value.machine.outgoingEdges[0]!.provider = { slug: "changed-provider" as typeof value.machine.origin.slug }; } },
    { path: "machine.preflightId", mutate: (value: ReturnType<typeof cutMapFixture>) => { value.machine.preflightId = canonicalDigest("tampered"); } },
  ])("refuses corrupted $path", ({ path, mutate }) => {
    const value = cutMapFixture(); mutate(value);
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "machine-identity", path } });
  });
});

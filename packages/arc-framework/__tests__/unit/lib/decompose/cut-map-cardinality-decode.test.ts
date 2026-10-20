import { describe, expect, it } from "vitest";
import { cutMapFixture, cutExtractionFixture } from "../../../fixtures/decompose-v4.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

function shapeMap(shape: CutMap["authoring"]["shape"], newCount: number, existing: boolean): CutMap {
  const value = cutMapFixture();
  value.authoring.shape = shape;
  value.authoring.destinations.splice(newCount);
  if (existing) value.authoring.destinations.push({ kind: "existing-home", destinationId: "z-existing", target: { kind: "work-unit", slug: "existing" } });
  value.authoring.internalEdges = [];
  for (const allocation of value.authoring.sourceAllocations) allocation.disposition = { kind: "drop", reason: "Superseded." };
  for (const edge of value.authoring.incomingDispositions) edge.disposition = { kind: "drop", reason: "Superseded." };
  for (const edge of value.authoring.outgoingDispositions) edge.disposition = { kind: "drop", reason: "Superseded." };
  return value;
}

describe("cut destination cardinality", () => {
  it.each([
    { shape: "symmetric" as const, newCount: 0, existing: false },
    { shape: "symmetric" as const, newCount: 1, existing: false },
    { shape: "symmetric" as const, newCount: 2, existing: true },
    { shape: "heterogeneous" as const, newCount: 2, existing: false },
    { shape: "heterogeneous" as const, newCount: 0, existing: true },
    { shape: "extraction" as const, newCount: 0, existing: false },
  ])("refuses $shape with $newCount new members and existing=$existing", ({ shape, newCount, existing }) => {
    expect(decodeCutMap(shapeMap(shape, newCount, existing))).toMatchObject({ status: "rejected", issue: { code: "shape-cardinality", path: "authoring.shape" } });
  });
  it("limits direct placement to one new member", () => {
    const value = cutMapFixture(); value.authoring.placement = { kind: "direct-member" };
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "placement-cardinality", path: "authoring.placement" } });
  });
  it("requires two new members in a retirement cohort", () => {
    expect(decodeCutMap(shapeMap("heterogeneous", 1, true))).toMatchObject({ status: "rejected", issue: { code: "placement-cardinality", path: "authoring.placement" } });
  });
  it("requires a destination-owned allocation for every extracted member", () => {
    const value = cutExtractionFixture();
    for (const allocation of value.authoring.sourceAllocations) allocation.ownership = "cohort-shared";
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "destination-coverage", path: "authoring.destinations.0" } });
    for (const allocation of value.authoring.sourceAllocations) allocation.ownership = "destination-owned";
    expect(decodeCutMap(value).status).toBe("accepted");
  });
});

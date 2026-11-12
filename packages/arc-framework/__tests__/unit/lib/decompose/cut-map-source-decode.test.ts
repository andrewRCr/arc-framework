import { describe, expect, it } from "vitest";
import { cutMapFixture, cutExtractionFixture, rebindCutFixture } from "../../../fixtures/decompose-v4.js";
import { digestBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { cutSourceId } from "../../../../src/lib/decompose/cut-map-machine.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

function companion(): CutMap {
  const value = cutExtractionFixture();
  const source = value.machine.sourceUnits[0]!;
  const sourceLocator = { artifact: "notes-origin.md", kind: "preamble" as const };
  const unit = { ...source, sourceLocator, sourceId: cutSourceId({ sourceLocator }), contentDigest: digestBytes(new TextEncoder().encode("# Notes\n\nNotes.\n")) };
  value.machine.sourceUnits.push(unit);
  value.machine.sourceUnits.sort((a, b) => Buffer.compare(Buffer.from(a.sourceId), Buffer.from(b.sourceId)));
  const allocations = new Map(value.authoring.sourceAllocations.map(item => [item.sourceId, item]));
  value.authoring.sourceAllocations = value.machine.sourceUnits.map(({ sourceId }) => allocations.get(sourceId) ?? {
    sourceId, ownership: "destination-owned", disposition: { kind: "drop", reason: "Moved away." },
  });
  rebindCutFixture(value);
  return value;
}

describe("cut source shape decoding", () => {
  it.each([
    { name: "active retirement", path: "machine.sourceKind", make: cutMapFixture, mutate: (v: CutMap) => { v.machine.sourceKind = "active-origin"; rebindCutFixture(v); } },
    { name: "stub extraction", path: "machine.sourceKind", make: cutExtractionFixture, mutate: (v: CutMap) => { v.machine.sourceKind = "backlog-stub"; rebindCutFixture(v); } },
    { name: "retirement retention", path: "authoring.sourceAllocations.0.disposition", make: cutMapFixture, mutate: (v: CutMap) => { v.authoring.sourceAllocations[0]!.disposition = { kind: "retained-origin" }; } },
    { name: "shared retention", path: "authoring.sourceAllocations.0.ownership", make: cutExtractionFixture, mutate: (v: CutMap) => { v.authoring.sourceAllocations[0]!.ownership = "cohort-shared"; v.authoring.sourceAllocations[0]!.disposition = { kind: "retained-origin" }; } },
  ])("refuses $name", ({ make, mutate, path }) => {
    const value = make(); mutate(value);
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "source-shape", path } });
  });
  it("requires companion scope to remain at the surviving origin", () => {
    const value = companion();
    const index = value.machine.sourceUnits.findIndex(unit => unit.sourceLocator.artifact === "notes-origin.md");
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "companion-disposition", path: `authoring.sourceAllocations.${index}.disposition` } });
    value.authoring.sourceAllocations[index]!.disposition = { kind: "retained-origin" };
    expect(decodeCutMap(value).status).toBe("accepted");
  });
});

import { describe, expect, it } from "vitest";
import { cutMapFixture, completeCutMapFixture, rebindCutFixture } from "../../../fixtures/decompose-v4.js";
import { scanV3DecomposeContent } from "../../../../src/lib/work-unit/decompose-content.js";
import { cutSourceId } from "../../../../src/lib/decompose/cut-map-machine.js";
import { digestBytes, canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import { CutMapSchema } from "../../../../src/lib/decompose/cut-map-schema.js";
import { decodeCutMapContent, writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";

function fixture() {
  const scan = scanV3DecomposeContent("draft-origin.md", new TextEncoder().encode("# Draft\n\n## Scope\n\n### Detail\nOwned work.\n"));
  if (scan.status !== "scanned") throw new Error("Expected scanned source.");
  const base = cutMapFixture();
  base.machine.sourceUnits = scan.units.map(unit => ({ sourceLocator: unit.locator,
    sourceId: cutSourceId({ sourceLocator: unit.locator }), contentDigest: digestBytes(unit.bytes) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.sourceId), Buffer.from(b.sourceId)));
  rebindCutFixture(base);
  const map = completeCutMapFixture(base.machine);
  map.authoring.placement = { kind: "subcohort", cohort: "parent/group", purpose: "é 𝄞", parentPurpose: "Parent" };
  const index = map.machine.sourceUnits.findIndex(unit => unit.sourceLocator.kind === "section" && unit.sourceLocator.ancestry.length > 0);
  if (index < 0) throw new Error("Expected a nested source section.");
  const allocation = map.authoring.sourceAllocations[index];
  if (allocation?.disposition.kind !== "target") throw new Error("Expected target allocation.");
  const locator = { ...allocation.disposition.targetLocator, artifact: "draft-home.md" };
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home-0",
    target: { kind: "draft-block", slug: "home", locator } });
  map.authoring.sourceAllocations[0]!.disposition = { kind: "drop", reason: "é 𝄞" };
  map.authoring.incomingDispositions[0]!.disposition = { kind: "drop", reason: "é 𝄞" };
  map.authoring.outgoingDispositions[0]!.disposition = { kind: "drop", reason: "é 𝄞" };
  return { map: CutMapSchema.parse(JSON.parse(JSON.stringify(map))), index };
}

function fields(index: number): string[] {
  const locators = ["authoring.destinations.0.target.locator",
    `authoring.sourceAllocations.${index}.disposition.targetLocator`, `machine.sourceUnits.${index}.sourceLocator`];
  return ["authoring.placement.purpose", "authoring.placement.parentPurpose",
    "authoring.sourceAllocations.0.disposition.reason", "authoring.incomingDispositions.0.disposition.reason",
    "authoring.outgoingDispositions.0.disposition.reason", "machine.planningProfile.sourceDesign.0",
    ...locators.flatMap(prefix => ["artifact", "headingSource", "ancestry.0.headingSource"].map(suffix => `${prefix}.${suffix}`))];
}

function field(input: unknown, path: string): { parent: Record<string, unknown>; key: string } {
  const parts = path.split(".");
  const key = parts.pop();
  let parent: unknown = input;
  for (const part of parts) {
    if (typeof parent !== "object" || parent === null) throw new Error(`Missing ${path}.`);
    parent = (parent as Record<string, unknown>)[part];
  }
  if (typeof parent !== "object" || parent === null || key === undefined) throw new Error(`Missing ${path}.`);
  return { parent: parent as Record<string, unknown>, key };
}

describe.each([{ label: "high", invalid: "\uD800" }, { label: "low", invalid: "\uDC00" }])("unpaired $label surrogate", ({ invalid }) => {
  it.each(fields(fixture().index))("refuses %s before identity hashing or storage and accepts its correction", path => {
    const { map } = fixture();
    const target = field(map, path);
    const original = target.parent[target.key];
    target.parent[target.key] = invalid;
    const input: unknown = JSON.parse(JSON.stringify(map));
    expect(decodeCutMap(input)).toMatchObject({ status: "rejected", issue: { code: "invalid-structure", path } });
    const repaired = field(input, path);
    repaired.parent[repaired.key] = original;
    const decoded = decodeCutMap(input);
    expect(decoded.status).toBe("accepted");
    if (decoded.status !== "accepted") throw new Error(JSON.stringify(decoded));
    expect(decodeCutMapContent(writeCutMapRecord(decoded.value)))
      .toEqual({ success: true, data: JSON.parse(canonicalize(decoded.value)) });
  });
});

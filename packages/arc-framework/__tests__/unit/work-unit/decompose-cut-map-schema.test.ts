/** Unit coverage for decomposition cut-map structural schemas. */

import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  DecomposeAllocationEntrySchema,
  DecomposeAllocationMapStructuralSchema,
  DecomposeContentLocatorSchema,
  DecomposeEdgeDispositionSchema,
  DecomposeExistingTargetSchema,
  DecomposeIncomingEdgeDispositionSchema,
  DecomposeSourceDispositionSchema,
  OriginPositionSchema,
  type DecomposeAllocationMap,
} from "../../../src/lib/work-unit/decompose-cut-map-schema.js";

const locators = [
  { artifact: "draft-alpha.md", kind: "preamble" },
  { artifact: "draft-alpha.md", kind: "section", headingSource: "## Scope", occurrence: 0 },
  { artifact: "draft-alpha.md", kind: "whole-file" },
] as const;

const entries = [
  { kind: "new-member", destinationId: "new", slug: "new-wu", workClass: "Heavy" },
  { kind: "surviving-origin", destinationId: "origin", slug: "origin-wu", disposition: "park" },
  { kind: "existing-home", destinationId: "home", target: { kind: "work-unit", slug: "home-wu" }, home: "fold" },
  { kind: "cohort-coordination", destinationId: "coord", cohort: "parent/child" },
] as const;

function validMap(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    origin: { slug: "origin-wu", phase: "Planning", location: "planned" },
    shape: "symmetric",
    parentPosition: "standalone",
    cohort: "my-cohort",
    entries: [entries[0]],
    internalEdges: [{ from: "new-wu", to: "other-wu" }],
    sourceAllocations: [{
      sourceId: canonicalDigest("source"),
      ownership: "destination-owned",
      disposition: { kind: "target", destinationId: "new", targetLocator: locators[0] },
    }],
    incomingEdges: [{ dependent: "consumer", disposition: { kind: "replace", replacementTargets: ["new-wu"] } }],
    outgoingEdges: [{ prerequisite: "base", disposition: { kind: "targets", targets: ["new-wu"] } }],
  };
}

describe("decompose cut-map structural schemas", () => {
  it.each(locators)("accepts locator arm $kind", (value) => {
    expect(DecomposeContentLocatorSchema.parse(value)).toEqual(value);
  });

  it.each(entries)("accepts allocation entry arm $kind", (value) => {
    expect(DecomposeAllocationEntrySchema.parse(value)).toEqual(value);
  });

  it.each([
    { kind: "work-unit", slug: "home-wu" },
    { kind: "draft-block", slug: "home-wu", locator: locators[0] },
    { kind: "document", path: ".arc/reference/PROJECT-PRD.md" },
  ] as const)("accepts existing target arm $kind", (value) => {
    expect(DecomposeExistingTargetSchema.parse(value)).toEqual(value);
  });

  it("accepts every edge and source disposition arm", () => {
    expect(DecomposeEdgeDispositionSchema.safeParse({ kind: "targets", targets: ["new-wu"] }).success).toBe(true);
    expect(DecomposeEdgeDispositionSchema.safeParse({ kind: "drop", reason: "obsolete" }).success).toBe(true);
    expect(DecomposeIncomingEdgeDispositionSchema.safeParse({ kind: "replace", replacementTargets: ["new-wu"] }).success).toBe(true);
    expect(DecomposeIncomingEdgeDispositionSchema.safeParse({ kind: "drop", reason: "obsolete" }).success).toBe(true);
    expect(DecomposeSourceDispositionSchema.safeParse({ kind: "target", destinationId: "new", targetLocator: locators[0] }).success).toBe(true);
    expect(DecomposeSourceDispositionSchema.safeParse({ kind: "drop", reason: "obsolete" }).success).toBe(true);
  });

  it.each(["Planning", "Active"] as const)("accepts origin phase %s", (phase) => {
    expect(OriginPositionSchema.safeParse({ slug: "origin-wu", phase, location: "active" }).success).toBe(true);
  });

  it("accepts an unsorted complete record and derives its type", () => {
    const value = validMap();
    expect(DecomposeAllocationMapStructuralSchema.parse(value)).toEqual(value);
    expectTypeOf<DecomposeAllocationMap>().toEqualTypeOf<z.infer<typeof DecomposeAllocationMapStructuralSchema>>();
  });

  it.each([
    { path: ["origin", "phase"], value: "Shipped" },
    { path: ["origin", "slug"], value: "Not Safe" },
    { path: ["entries", 0, "workClass"], value: "TBD" },
    { path: ["sourceAllocations", 0, "sourceId"], value: "sha256:nope" },
    { path: ["sourceAllocations", 0, "disposition", "targetLocator", "artifact"], value: "path/draft.md" },
    { path: ["entries", 0, "kind"], value: "unknown" },
  ])("rejects invalid structural value at $path", ({ path, value }) => {
    const input = structuredClone(validMap());
    let target = input as Record<string | number, unknown>;
    for (const segment of path.slice(0, -1)) target = target[segment] as Record<string | number, unknown>;
    target[path.at(-1)!] = value;
    expect(DecomposeAllocationMapStructuralSchema.safeParse(input).success).toBe(false);
  });

  it("rejects additive fields while leaving optional cohort and ordering unconstrained", () => {
    expect(DecomposeAllocationMapStructuralSchema.safeParse({ ...validMap(), extra: true }).success).toBe(false);
    const withoutCohort = validMap();
    delete withoutCohort.cohort;
    expect(DecomposeAllocationMapStructuralSchema.safeParse(withoutCohort).success).toBe(true);
  });
});

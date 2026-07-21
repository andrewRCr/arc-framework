/** Unit coverage for decomposition cut-map structural schemas. */

import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  DecomposeAllocationEntrySchema,
  DecomposeAllocationMapSchema,
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
    entries: [
      entries[0],
      { kind: "new-member", destinationId: "other", slug: "other-wu", workClass: "Light" },
    ],
    internalEdges: [{ from: "new-wu", to: "other-wu" }],
    sourceAllocations: [{
      sourceId: canonicalDigest("source"),
      ownership: "destination-owned",
      disposition: {
        kind: "target",
        destinationId: "new",
        targetLocator: { artifact: "draft-new-wu.md", kind: "preamble" },
      },
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

describe("DecomposeAllocationMapSchema refinements", () => {
  function issues(input: Record<string, unknown>): string[] {
    const result = DecomposeAllocationMapSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }

  it("accepts a complete graph without normalizing collection order", () => {
    const value = validMap();
    expect(DecomposeAllocationMapSchema.parse(value)).toEqual(value);
  });

  it("targets duplicate destination ids and identities", () => {
    const duplicateId = validMap();
    (duplicateId.entries as Array<Record<string, unknown>>)[1]!.destinationId = "new";
    expect(issues(duplicateId).join("\n")).toMatch(/entries: duplicate destinationId/u);

    const duplicateIdentity = validMap();
    (duplicateIdentity.entries as Array<Record<string, unknown>>)[1]!.slug = "new-wu";
    expect(issues(duplicateIdentity).join("\n")).toMatch(/entries: duplicate destination identity/u);
  });

  it("enforces placement, shape, and cohort-coordination coupling", () => {
    expect(issues({ ...validMap(), parentPosition: "at-cap" }).join("\n")).toMatch(/cohort: at-cap/u);
    expect(issues({ ...validMap(), entries: [entries[0]] }).join("\n")).toMatch(/entries: symmetric/u);
    const coordination = validMap();
    (coordination.entries as unknown[]).push({
      kind: "cohort-coordination",
      destinationId: "coord",
      cohort: "other-cohort",
    });
    expect(issues(coordination).join("\n")).toMatch(/entries\.2\.cohort/u);
  });

  it("enforces existing-home and locator ownership coupling", () => {
    const input = validMap();
    (input.entries as unknown[]).push({
      kind: "existing-home",
      destinationId: "draft",
      target: {
        kind: "draft-block",
        slug: "design-home",
        locator: { artifact: "draft-other.md", kind: "preamble" },
      },
      home: "atomic-edit",
    });
    expect(issues(input).join("\n")).toMatch(/entries\.2\.(home|target\.locator)/u);
  });

  it("enforces internal-edge membership, uniqueness, and self-dependencies", () => {
    const unknown = validMap();
    unknown.internalEdges = [{ from: "unknown", to: "new-wu" }];
    expect(issues(unknown).join("\n")).toMatch(/internalEdges\.0\.from/u);

    const duplicate = validMap();
    duplicate.internalEdges = [{ from: "new-wu", to: "other-wu" }, { from: "new-wu", to: "other-wu" }];
    expect(issues(duplicate).join("\n")).toMatch(/internalEdges: duplicate/u);
  });

  it("requires unique source allocations targeting declared destination locators", () => {
    const unknown = validMap();
    (unknown.sourceAllocations as Array<Record<string, unknown>>)[0]!.disposition = {
      kind: "target",
      destinationId: "missing",
      targetLocator: { artifact: "draft-new-wu.md", kind: "preamble" },
    };
    expect(issues(unknown).join("\n")).toMatch(/sourceAllocations\.0\.disposition\.destinationId/u);

    const wrongLocator = validMap();
    (wrongLocator.sourceAllocations as Array<Record<string, unknown>>)[0]!.disposition = {
      kind: "target",
      destinationId: "new",
      targetLocator: { artifact: "draft-other-wu.md", kind: "preamble" },
    };
    expect(issues(wrongLocator).join("\n")).toMatch(/sourceAllocations\.0\.disposition\.targetLocator/u);
  });

  it("enforces dependency recipients, edge uniqueness, target uniqueness, and self-dependencies", () => {
    const invalid = validMap();
    invalid.incomingEdges = [{
      dependent: "new-wu",
      disposition: { kind: "replace", replacementTargets: ["new-wu", "missing", "missing"] },
    }];
    invalid.outgoingEdges = [
      { prerequisite: "base", disposition: { kind: "targets", targets: ["new-wu"] } },
      { prerequisite: "base", disposition: { kind: "drop", reason: "duplicate" } },
    ];
    const messages = issues(invalid).join("\n");
    expect(messages).toMatch(/incomingEdges\.0/u);
    expect(messages).toMatch(/outgoingEdges: duplicate/u);
  });

  it("accepts extraction independently from retirement authorization", () => {
    const extraction = validMap();
    extraction.shape = "extraction";
    extraction.entries = [
      { kind: "surviving-origin", destinationId: "origin", slug: "origin-wu", disposition: "keep-active" },
      entries[0],
    ];
    extraction.internalEdges = [];
    expect(DecomposeAllocationMapSchema.safeParse(extraction).success).toBe(true);
  });
});

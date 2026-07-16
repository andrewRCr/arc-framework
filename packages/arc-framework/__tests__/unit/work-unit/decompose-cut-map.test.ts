import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  parseCutMap,
  retirementAllocationRefusal,
  type DecomposeAllocationMap,
} from "../../../src/lib/work-unit/decompose-cut-map.js";

const SOURCE_A = canonicalDigest("source-a");
const SOURCE_B = canonicalDigest("source-b");

function wellFormed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    origin: { slug: "origin-wu", phase: "Planning", location: "planned" },
    shape: "symmetric",
    parentPosition: "standalone",
    cohort: "my-cohort",
    entries: [
      { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
      { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Heavy" },
      {
        kind: "existing-home",
        destinationId: "existing-wu",
        target: { kind: "work-unit", slug: "existing-target" },
        home: "fold",
      },
    ],
    internalEdges: [{ from: "member-b", to: "member-a" }],
    sourceAllocations: [
      {
        sourceId: SOURCE_B,
        disposition: {
          kind: "target",
          destinationId: "member-b",
          targetLocator: { artifact: "draft-member-b.md", kind: "preamble" },
        },
      },
      { sourceId: SOURCE_A, disposition: { kind: "drop", reason: "superseded framing" } },
    ],
    incomingEdges: [
      { dependent: "consumer-z", disposition: { kind: "replace", replacementTargets: ["member-b", "member-a"] } },
    ],
    outgoingEdges: [
      { prerequisite: "foundation-z", disposition: { kind: "targets", targets: ["member-b", "member-a"] } },
    ],
    ...overrides,
  };
}

function parsed(input: Record<string, unknown>): DecomposeAllocationMap {
  const result = parseCutMap(input);
  expect(result.status).toBe("parsed");
  if (result.status !== "parsed") throw new Error(result.reason);
  return result.params;
}

function rejection(input: Record<string, unknown>): string {
  const result = parseCutMap(input);
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") throw new Error("expected rejection");
  return result.reason;
}

describe("parseCutMap", () => {
  it("parses and canonically orders a schema-version-2 allocation map", () => {
    const map = parsed(wellFormed());

    expect(map.schemaVersion).toBe(2);
    expect(map.entries.map((entry) => entry.destinationId)).toEqual(["existing-wu", "member-a", "member-b"]);
    expect(map.sourceAllocations.map((entry) => entry.sourceId)).toEqual([SOURCE_A, SOURCE_B].sort());
    expect(map.incomingEdges[0]?.disposition).toEqual({
      kind: "replace",
      replacementTargets: ["member-a", "member-b"],
    });
    expect(map.outgoingEdges[0]?.disposition).toEqual({ kind: "targets", targets: ["member-a", "member-b"] });
  });

  it("rejects unknown fields at every validated level", () => {
    expect(rejection(wellFormed({ typo: true }))).toMatch(/unknown.*typo/i);
    const input = wellFormed();
    input.origin = { slug: "origin-wu", phase: "Planning", location: "planned", typo: true };
    expect(rejection(input)).toMatch(/unknown.*typo/i);
  });

  it("rejects duplicate destination IDs and duplicate destination identities", () => {
    const duplicateId = wellFormed();
    duplicateId.entries = [
      { kind: "new-member", destinationId: "same", slug: "member-a", workClass: "Light" },
      { kind: "new-member", destinationId: "same", slug: "member-b", workClass: "Light" },
    ];
    expect(rejection(duplicateId)).toMatch(/duplicate.*destinationId/i);

    const duplicateIdentity = wellFormed();
    duplicateIdentity.entries = [
      { kind: "new-member", destinationId: "new", slug: "member-a", workClass: "Light" },
      {
        kind: "existing-home",
        destinationId: "existing",
        target: { kind: "work-unit", slug: "member-a" },
        home: "fold",
      },
    ];
    expect(rejection(duplicateIdentity)).toMatch(/duplicate.*identity/i);
  });

  it("accepts dependency recipients only when they are new members or existing work-unit homes", () => {
    const unknownIncoming = wellFormed({
      incomingEdges: [{ dependent: "consumer", disposition: { kind: "replace", replacementTargets: ["unknown"] } }],
    });
    expect(rejection(unknownIncoming)).toMatch(/replacement target.*unknown/i);

    const unknownOutgoing = wellFormed({
      outgoingEdges: [{ prerequisite: "foundation", disposition: { kind: "targets", targets: ["unknown"] } }],
    });
    expect(rejection(unknownOutgoing)).toMatch(/consumer.*unknown/i);
  });

  it("prevents draft blocks, documents, and cohort coordination from receiving dependencies", () => {
    const entryVariants = [
      {
        kind: "existing-home",
        destinationId: "ineligible",
        target: {
          kind: "draft-block",
          slug: "design-home",
          locator: { artifact: "draft-design-home.md", kind: "preamble" },
        },
        home: "fold",
      },
      {
        kind: "existing-home",
        destinationId: "ineligible",
        target: { kind: "document", path: ".arc/reference/PROJECT-PRD.md" },
        home: "atomic-edit",
      },
      { kind: "cohort-coordination", destinationId: "ineligible", cohort: "my-cohort" },
    ];

    for (const entry of entryVariants) {
      const input = wellFormed({
        entries: [
          { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
          { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
          entry,
        ],
        incomingEdges: [
          { dependent: "consumer", disposition: { kind: "replace", replacementTargets: ["ineligible"] } },
        ],
      });
      expect(rejection(input)).toMatch(/cannot receive|replacement target/i);
    }
  });

  it("requires the sole cohort-coordination entry to name the declared cohort", () => {
    const two = wellFormed();
    two.entries = [
      { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
      { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
      { kind: "cohort-coordination", destinationId: "coord-a", cohort: "my-cohort" },
      { kind: "cohort-coordination", destinationId: "coord-b", cohort: "my-cohort" },
    ];
    expect(rejection(two)).toMatch(/at most one.*cohort-coordination/i);

    const wrong = wellFormed();
    wrong.entries = [
      { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
      { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
      { kind: "cohort-coordination", destinationId: "coord", cohort: "other-cohort" },
    ];
    expect(rejection(wrong)).toMatch(/declared cohort/i);
  });

  it("parses extraction but prevents it from authorizing retirement", () => {
    const input = wellFormed({
      shape: "extraction",
      entries: [
        {
          kind: "surviving-origin",
          destinationId: "origin",
          slug: "origin-wu",
          disposition: "keep-active",
        },
        { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
        { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
      ],
    });
    const map = parsed(input);
    expect(retirementAllocationRefusal(map, { ownerlessSourceIds: [] })).toMatch(/surviving origin.*retire/i);
  });

  it("requires ownerless shared material to target minted cohort coordination", () => {
    const map = parsed(wellFormed());
    expect(retirementAllocationRefusal(map, { ownerlessSourceIds: [SOURCE_B] })).toMatch(/cohort-coordination/i);

    const withCoordination = wellFormed();
    withCoordination.entries = [
      ...(withCoordination.entries as unknown[]),
      { kind: "cohort-coordination", destinationId: "coord", cohort: "my-cohort" },
    ];
    withCoordination.sourceAllocations = [
      { sourceId: SOURCE_A, disposition: { kind: "drop", reason: "superseded" } },
      {
        sourceId: SOURCE_B,
        disposition: {
          kind: "target",
          destinationId: "coord",
          targetLocator: { artifact: "cohort-my-cohort.md", kind: "preamble" },
        },
      },
    ];
    expect(retirementAllocationRefusal(parsed(withCoordination), { ownerlessSourceIds: [SOURCE_B] })).toBeNull();
  });

  it("requires non-empty unique target sets or a reasoned drop", () => {
    expect(
      rejection(wellFormed({ incomingEdges: [{ dependent: "consumer", disposition: { kind: "replace", replacementTargets: [] } }] })),
    ).toMatch(/non-empty|drop/i);
    expect(
      rejection(wellFormed({ outgoingEdges: [{ prerequisite: "foundation", disposition: { kind: "drop", reason: "" } }] })),
    ).toMatch(/reason/i);
    expect(
      rejection(wellFormed({ outgoingEdges: [{ prerequisite: "foundation", disposition: { kind: "targets", targets: ["member-a", "member-a"] } }] })),
    ).toMatch(/duplicate/i);
  });

  it("returns a schema-version-1 upgrade diagnostic", () => {
    expect(rejection(wellFormed({ schemaVersion: 1 }))).toMatch(/upgrade.*version 2.*sourceAllocations.*incomingEdges.*outgoingEdges/i);
  });
});

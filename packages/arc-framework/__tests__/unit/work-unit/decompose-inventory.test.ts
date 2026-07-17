import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import {
  deriveDecomposeInventories,
  verifyDecomposeInventoryCoverage,
} from "../../../src/lib/work-unit/decompose-inventory.js";
import { buildLifecycleIndexFromRecords } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { DecomposeAllocationMap } from "../../../src/lib/work-unit/decompose-cut-map.js";

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

function lifecycleIndex() {
  return buildLifecycleIndexFromRecords([
    { slug: "origin", state: "Planning", location: "active", dependsOn: ["foundation-b", "foundation-a"] },
    { slug: "consumer-z", state: "Active", location: "active", dependsOn: ["other-a", "origin", "other-b"] },
    { slug: "consumer-a", state: "Planning", location: "planned", dependsOn: ["origin", "other-c"] },
    { slug: "shipped", state: "Shipped", location: "completed", dependsOn: ["origin"] },
  ]);
}

function derive() {
  return deriveDecomposeInventories({
    originSlug: "origin",
    sourceArtifacts: [
      {
        path: validateManagedPath(".arc/active/draft-origin.md"),
        bytes: bytes("intro\n## One\nfirst\n## Two\nsecond\n"),
      },
      { path: validateManagedPath(".arc/active/notes-origin.txt"), bytes: bytes("research\n") },
      { path: validateManagedPath(".arc/active/meta-origin.md"), bytes: bytes("structural\n") },
      { path: validateManagedPath(".arc/backlog/ROADMAP.md"), bytes: bytes("generated\n") },
    ],
    lifecycleIndex: lifecycleIndex(),
  });
}

describe("deriveDecomposeInventories", () => {
  it("derives source units and dependency edges from live projections", () => {
    const result = derive();

    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    expect(result.inventories.sourceInventory).toHaveLength(4);
    expect(result.inventories.sourceInventory.map((unit) => unit.sourcePath)).not.toContain(
      ".arc/active/meta-origin.md",
    );
    expect(result.inventories.sourceInventory.map((unit) => unit.sourcePath)).not.toContain(
      ".arc/backlog/ROADMAP.md",
    );
    expect(result.inventories.incomingEdgeInventory.map((edge) => edge.dependent)).toEqual([
      "consumer-a",
      "consumer-z",
    ]);
    expect(result.inventories.outgoingEdgeInventory).toEqual([
      { prerequisite: "foundation-a" },
      { prerequisite: "foundation-b" },
    ]);
  });

  it("retains each dependent's parsed Depends On order in currentTargets", () => {
    const result = derive();
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;

    expect(result.inventories.incomingEdgeInventory).toContainEqual({
      dependent: "consumer-z",
      currentTargets: ["other-a", "origin", "other-b"],
    });
  });

  it("computes source IDs from the schema, live path, and scanned locator", () => {
    const result = derive();
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    const first = result.inventories.sourceInventory.find(
      (unit) => unit.sourcePath === ".arc/active/draft-origin.md" && unit.sourceLocator.kind === "preamble",
    );
    expect(first?.sourceId).toBe(
      canonicalDigest({
        schemaVersion: 2,
        sourcePath: ".arc/active/draft-origin.md",
        sourceLocator: { artifact: "draft-origin.md", kind: "preamble" },
      }),
    );
  });
});

describe("verifyDecomposeInventoryCoverage", () => {
  it("requires exact one-to-one source, incoming, and outgoing coverage", () => {
    const result = derive();
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    const map: DecomposeAllocationMap = {
      schemaVersion: 2,
      origin: { slug: "origin", phase: "Planning", location: "active" },
      shape: "symmetric",
      parentPosition: "standalone",
      cohort: "origin",
      entries: [
        { kind: "new-member", destinationId: "a", slug: "member-a", workClass: "Light" },
        { kind: "new-member", destinationId: "b", slug: "member-b", workClass: "Light" },
      ],
      internalEdges: [],
      sourceAllocations: result.inventories.sourceInventory.map(({ sourceId }) => ({
        sourceId,
        ownership: "destination-owned",
        disposition: { kind: "drop", reason: "not retained" },
      })),
      incomingEdges: result.inventories.incomingEdgeInventory.map(({ dependent }) => ({
        dependent,
        disposition: { kind: "replace", replacementTargets: ["member-a"] },
      })),
      outgoingEdges: result.inventories.outgoingEdgeInventory.map(({ prerequisite }) => ({
        prerequisite,
        disposition: { kind: "targets", targets: ["member-a"] },
      })),
    };

    expect(verifyDecomposeInventoryCoverage(map, result.inventories)).toEqual({ status: "covered" });
    expect(
      verifyDecomposeInventoryCoverage(
        { ...map, sourceAllocations: map.sourceAllocations.slice(1) },
        result.inventories,
      ),
    ).toMatchObject({ status: "rejected", reason: expect.stringMatching(/missing source/i) });
    expect(
      verifyDecomposeInventoryCoverage(
        {
          ...map,
          outgoingEdges: [
            ...map.outgoingEdges,
            { prerequisite: "invented", disposition: { kind: "drop", reason: "not real" } },
          ],
        },
        result.inventories,
      ),
    ).toMatchObject({ status: "rejected", reason: expect.stringMatching(/extra outgoing/i) });
    expect(
      verifyDecomposeInventoryCoverage(map, {
        ...result.inventories,
        sourceInventory: [
          ...result.inventories.sourceInventory,
          result.inventories.sourceInventory[0]!,
        ],
      }),
    ).toMatchObject({ status: "rejected", reason: expect.stringMatching(/duplicate.*live source/i) });
  });
});

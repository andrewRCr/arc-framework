import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { describe, expect, it } from "vitest";
import { scanV3DecomposeContent } from "../../../../src/lib/work-unit/decompose-content.js";
import { cutSourceId, cutIncomingEdgeId, cutOutgoingEdgeId, cutPreflightId, CutMapMachineSchema } from "../../../../src/lib/decompose/cut-map-machine.js";

function section(heading: string, body: string) {
  const scan = scanV3DecomposeContent("draft-origin.md", new TextEncoder().encode(`# Draft\n\n## ${heading}\n${body}\n`));
  if (scan.status !== "scanned") throw new Error("Fixture did not scan");
  const unit = scan.units.find(item => item.locator.kind === "section");
  if (unit === undefined) throw new Error("Fixture has no section");
  return unit;
}

function facts() {
  const sourceLocator = section("Owned scope", "Before").locator;
  const dependent = { slug: "consumer", uid: "22222222-2222-4222-8222-222222222222" };
  const provider = { slug: "foundation", uid: "33333333-3333-4333-8333-333333333333" };
  return {
    origin: { slug: "origin", uid: "11111111-1111-4111-8111-111111111111" },
    sourceKind: "started-planning" as const,
    planningProfile: { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
    sourceUnits: [{ sourceLocator, sourceId: cutSourceId({ sourceLocator }), contentDigest: canonicalDigest("Before") }],
    incomingEdges: [{ dependent, edgeId: cutIncomingEdgeId({ dependent }) }],
    outgoingEdges: [{ provider, edgeId: cutOutgoingEdgeId({ provider }) }],
  };
}

describe("store cut machine identities", () => {
  it("identifies source scope by locator while allowing its body to change", () => {
    const original = section("Owned scope", "Before");
    const edited = section("Owned scope", "After");
    const other = section("Other scope", "Before");
    expect(cutSourceId({ sourceLocator: original.locator })).toBe(cutSourceId({ sourceLocator: edited.locator }));
    expect(cutSourceId({ sourceLocator: original.locator })).not.toBe(cutSourceId({ sourceLocator: other.locator }));
  });
  it("identifies incoming edges by dependent generation across renames", () => {
    const uid = "11111111-1111-4111-8111-111111111111";
    const original = { dependent: { slug: "consumer", uid } };
    const renamed = { dependent: { slug: "renamed-consumer", uid } };
    const replacement = { dependent: { slug: "consumer", uid: "22222222-2222-4222-8222-222222222222" } };
    expect(cutIncomingEdgeId(original)).toBe(cutIncomingEdgeId(renamed));
    expect(cutIncomingEdgeId(original)).not.toBe(cutIncomingEdgeId(replacement));
  });
  it("keeps unresolved providers slug-keyed and resolved providers generation-keyed", () => {
    const uid = "11111111-1111-4111-8111-111111111111";
    expect(cutOutgoingEdgeId({ provider: { slug: "foundation", uid } }))
      .toBe(cutOutgoingEdgeId({ provider: { slug: "renamed-foundation", uid } }));
    expect(cutOutgoingEdgeId({ provider: { slug: "foundation" } }))
      .not.toBe(cutOutgoingEdgeId({ provider: { slug: "other-foundation" } }));
    expect(cutOutgoingEdgeId({ provider: { slug: "foundation", uid } }))
      .not.toBe(cutOutgoingEdgeId({ provider: { slug: "foundation" } }));
  });
  it("binds every machine field into the preflight identity", () => {
    const original = facts();
    const id = cutPreflightId(original);
    expect(cutPreflightId(structuredClone(original))).toBe(id);
    const variants = [
      { ...original, origin: { ...original.origin, slug: "renamed-origin" } },
      { ...original, sourceKind: "active-origin" as const },
      { ...original, planningProfile: { kind: "single-spec" as const, sourceDesign: ["spec-origin.md"] as [string] } },
      { ...original, sourceUnits: [] },
      { ...original, incomingEdges: [] },
      { ...original, outgoingEdges: [] },
    ];
    for (const changed of variants) expect(cutPreflightId(changed)).not.toBe(id);
  });
  it("accepts only record-bound machine facts without Git pins", () => {
    const value = facts();
    const machine = { ...value, preflightId: cutPreflightId(value) };
    expect(CutMapMachineSchema.safeParse(machine).success).toBe(true);
    expect(CutMapMachineSchema.safeParse({ ...machine, origin: { slug: "origin" } }).success).toBe(false);
    expect(CutMapMachineSchema.safeParse({ ...machine, resultBase: { ref: "main", head: "a".repeat(40) } }).success).toBe(false);
    expect(CutMapMachineSchema.safeParse({ ...machine, incomingEdges: [{ edgeId: value.incomingEdges[0]!.edgeId, dependent: { slug: "consumer" } }] }).success).toBe(false);
    expect(CutMapMachineSchema.safeParse({ ...machine, sourceUnits: [{ ...value.sourceUnits[0], sourcePath: "old-path" }] }).success).toBe(false);
  });
});

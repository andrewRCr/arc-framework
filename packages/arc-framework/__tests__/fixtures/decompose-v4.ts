import { digestBytes } from "../../src/lib/kernel/canonical/canonical-json.js";
import { scanV3DecomposeContent } from "../../src/lib/work-unit/decompose-content.js";
import { CutMapSchema, type CutMap } from "../../src/lib/decompose/cut-map-schema.js";
import { cutSourceId, cutIncomingEdgeId, cutOutgoingEdgeId, cutPreflightId, type CutMapMachine } from "../../src/lib/decompose/cut-map-machine.js";

/** Completed record-bound map with scanner-derived source units and two of each edge. */
export function cutMapFixture(): CutMap {
  const scan = scanV3DecomposeContent("draft-origin.md", new TextEncoder().encode("# Draft\n\n## Scope\nOwned work.\n"));
  if (scan.status !== "scanned") throw new Error("Fixture source must scan");
  const sourceUnits = scan.units.map(unit => ({
    sourceLocator: unit.locator, sourceId: cutSourceId({ sourceLocator: unit.locator }), contentDigest: digestBytes(unit.bytes),
  })).sort((a, b) => Buffer.compare(Buffer.from(a.sourceId), Buffer.from(b.sourceId)));
  const incomingEdges = [
    { slug: "consumer-a", uid: "22222222-2222-4222-8222-222222222222" },
    { slug: "consumer-b", uid: "33333333-3333-4333-8333-333333333333" },
  ].map(dependent => ({ dependent, edgeId: cutIncomingEdgeId({ dependent }) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.edgeId), Buffer.from(b.edgeId)));
  const outgoingEdges = [{ slug: "foundation-a" }, { slug: "foundation-b", uid: "44444444-4444-4444-8444-444444444444" }]
    .map(provider => ({ provider, edgeId: cutOutgoingEdgeId({ provider }) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.edgeId), Buffer.from(b.edgeId)));
  const facts = {
    origin: { slug: "origin", uid: "11111111-1111-4111-8111-111111111111" },
    sourceKind: "started-planning" as const,
    planningProfile: { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
    sourceUnits, incomingEdges, outgoingEdges,
  };
  return CutMapSchema.parse({
    schemaVersion: 4, machine: { ...facts, preflightId: cutPreflightId(facts) },
    authoring: {
      shape: "symmetric", placement: { kind: "cohort", cohort: "group", purpose: "Coordinate the work." },
      destinations: [
        { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
        { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Heavy" },
      ],
      internalEdges: [{ from: "member-a", to: "member-b" }], externalEdges: [],
      sourceAllocations: sourceUnits.map(unit => ({ sourceId: unit.sourceId, ownership: "destination-owned",
        disposition: { kind: "target", destinationId: "member-a", targetLocator: { ...unit.sourceLocator, artifact: "draft-member-a.md" } },
      })),
      incomingDispositions: incomingEdges.map(({ edgeId }) => ({ edgeId, disposition: { kind: "replace", replacementTargets: ["member-a"] } })),
      outgoingDispositions: outgoingEdges.map(({ edgeId }) => ({ edgeId, disposition: { kind: "targets", targets: ["member-b"] } })),
    },
  });
}

/** A surviving origin with a single substantively covered new member. */
export function cutExtractionFixture(): CutMap {
  const value = cutMapFixture();
  value.machine.sourceKind = "active-origin";
  rebindCutFixture(value);
  value.authoring.shape = "extraction";
  value.authoring.placement = { kind: "direct-member" };
  value.authoring.destinations.splice(1);
  value.authoring.internalEdges = [];
  for (const edge of value.authoring.incomingDispositions) edge.disposition = { kind: "replace", replacementTargets: ["origin"] };
  for (const edge of value.authoring.outgoingDispositions) edge.disposition = { kind: "targets", targets: ["member-a"] };
  return value;
}

/** Rebind machine facts after an intentional fixture edit. */
export function rebindCutFixture(value: CutMap): void {
  const { origin, sourceKind, planningProfile, sourceUnits, incomingEdges, outgoingEdges } = value.machine;
  value.machine.preflightId = cutPreflightId({ origin, sourceKind, planningProfile, sourceUnits, incomingEdges, outgoingEdges });
}

/** Complete a freshly observed machine with covered new members and explicit edge dispositions. */
export function completeCutMapFixture(machine: CutMapMachine, extraction = false): CutMap {
  const map = extraction ? cutExtractionFixture() : cutMapFixture();
  map.machine = machine;
  map.authoring.sourceAllocations = machine.sourceUnits.map(({ sourceId, sourceLocator }) => ({ sourceId,
    ownership: "destination-owned", disposition: { kind: "target", destinationId: "member-a",
      targetLocator: { ...sourceLocator, artifact: "draft-member-a.md" } } }));
  map.authoring.incomingDispositions = machine.incomingEdges.map(({ edgeId }) => ({ edgeId,
    disposition: { kind: "replace", replacementTargets: [extraction ? machine.origin.slug : "member-a"] } }));
  map.authoring.outgoingDispositions = machine.outgoingEdges.map(({ edgeId }) => ({ edgeId,
    disposition: { kind: "targets", targets: [extraction ? "member-a" : "member-b"] } }));
  return map;
}

import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { cutPreflightId, cutSourceId, cutIncomingEdgeId, cutOutgoingEdgeId, CutMapMachineSchema } from "../../../../src/lib/decompose/cut-map-machine.js";
import { CutCompletedAuthoringSchema } from "../../../../src/lib/decompose/cut-map-authoring.js";
import { createCutMapStarter, parseCutMapStarter } from "../../../../src/lib/decompose/cut-map-starter.js";

function machine() {
  const sourceLocator = { kind: "whole-file" as const, artifact: "draft-origin.md" };
  const dependent = { slug: "consumer", uid: "22222222-2222-4222-8222-222222222222" };
  const provider = { slug: "foundation" };

  const facts = {
    origin: { slug: "origin", uid: "11111111-1111-4111-8111-111111111111" },
    sourceKind: "started-planning" as const,
    planningProfile: { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
    sourceUnits: [{ sourceId: cutSourceId({ sourceLocator }), sourceLocator, contentDigest: canonicalDigest("source") }],
    incomingEdges: [{ edgeId: cutIncomingEdgeId({ dependent }), dependent }],
    outgoingEdges: [{ edgeId: cutOutgoingEdgeId({ provider }), provider }],
  };
  return CutMapMachineSchema.parse({ ...facts, preflightId: cutPreflightId(facts) });
}

describe("cut map authoring", () => {
  it("builds a parseable starter whose decisions are all author slots", () => {
    const input = machine();
    const starter = createCutMapStarter(input);
    const author = { status: "author" };
    expect(starter).toEqual({ schemaVersion: 4, machine: input, authoring: {
      shape: author, placement: author, destinations: author, internalEdges: author, externalEdges: author,
      sourceAllocations: input.sourceUnits.map(({ sourceId }) => ({ sourceId, ownership: author, disposition: author })),
      incomingDispositions: input.incomingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
      outgoingDispositions: input.outgoingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
    } });
    expect(parseCutMapStarter(starter)).toEqual(starter);
    expect(parseCutMapStarter({ ...starter, machine: { ...input, preflightId: canonicalDigest("tampered") } })).toBeNull();
  });
  it("accepts cohort purposes as optional placement decisions", () => {
    const authoring = {
      shape: "symmetric", destinations: [], internalEdges: [], externalEdges: [],
      sourceAllocations: [], incomingDispositions: [], outgoingDispositions: [],
    };
    for (const placement of [
      { kind: "cohort", cohort: "program", purpose: "Coordinate the program." },
      { kind: "subcohort", cohort: "program/area", purpose: "Coordinate the area.", parentPurpose: "Coordinate the program." },
    ]) {
      expect(CutCompletedAuthoringSchema.safeParse({ ...authoring, placement }).success).toBe(true);
      const withoutPurposes = { kind: placement.kind, cohort: placement.cohort };
      expect(CutCompletedAuthoringSchema.safeParse({ ...authoring, placement: withoutPurposes }).success).toBe(true);
    }
    expect(CutCompletedAuthoringSchema.safeParse({ ...authoring, placement: { kind: "cohort", cohort: "program", purpose: " " } }).success).toBe(false);
  });
});

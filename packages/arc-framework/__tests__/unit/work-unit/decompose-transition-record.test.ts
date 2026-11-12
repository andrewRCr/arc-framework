import { describe, expect, it } from "vitest";

import { createDecomposeTransitionRecord } from "../../../src/lib/work-unit/decompose-transition-record.js";
import { parseV3DecomposeCutMap, v3OutgoingEdgeId, v3PreflightId, type V3DecomposeCutMap } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

describe("decompose transition record projection", () => {
  it("records outgoing targets including an existing destination, and retains dropped prerequisites", () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    map.authoring.shape = "heterogeneous";
    map.authoring.destinations.push({
      kind: "existing-home", destinationId: "existing", target: { kind: "work-unit", slug: "existing-home" },
    });
    map.authoring.destinations.sort((left, right) => Buffer.compare(Buffer.from(left.destinationId), Buffer.from(right.destinationId)));
    map.machine.outgoingEdges = ["foundation-a", "foundation-b"].map((prerequisite) => ({
      prerequisite, edgeId: v3OutgoingEdgeId({ prerequisite }),
    }));
    map.machine.preflightId = v3PreflightId({
      source: map.machine.source, resultBase: map.machine.resultBase, planningProfile: map.machine.planningProfile,
      sourceUnits: map.machine.sourceUnits, incomingEdges: map.machine.incomingEdges, outgoingEdges: map.machine.outgoingEdges,
    });
    map.authoring.outgoingDispositions = map.machine.outgoingEdges.map(({ edgeId }, index) => ({
      edgeId, disposition: index === 0
        ? { kind: "targets", targets: ["existing-home", "member-b"] }
        : { kind: "drop", reason: "No destination needs it" },
    }));
    expect(parseV3DecomposeCutMap(map)).not.toBeNull();
    expect(createDecomposeTransitionRecord(map)).toMatchObject({
      outgoing: [
        { prerequisite: { name: "foundation-a" }, members: [{ name: "existing-home" }, { name: "member-b" }] },
        { prerequisite: { name: "foundation-b" }, members: [] },
      ],
    });
  });
  it("projects only origin, new successors, and dependent-keyed authored dispositions", () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    map.authoring.externalEdges = [{ from: "member-a", to: "foundation" }];

    const record = createDecomposeTransitionRecord(map);

    expect(record).toEqual({
      schemaVersion: 2,
      origin: { name: "origin" },
      kind: "decompose",
      successors: [{ name: "member-a" }, { name: "member-b" }],
      incoming: [{
        dependent: { name: "consumer" },
        disposition: { kind: "replace", replacementTargets: [{ name: "member-a" }] },
      }],
      outgoing: [],
    });
    expect(record === null ? "" : writeLineageRecord(record)).not.toMatch(
      /receipt|preparation|finalized|digest|publication|continuation/iu,
    );
  });

  it.each(["missing", "mismatched"] as const)("refuses %s authored incoming dispositions", (variant) => {
    const original = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const incomingDispositions = variant === "missing"
      ? []
      : [{ ...original.authoring.incomingDispositions[0]!, edgeId: `sha256:${"f".repeat(64)}` }];
    const invalid = {
      ...original,
      authoring: { ...original.authoring, incomingDispositions },
    } as V3DecomposeCutMap;

    expect(createDecomposeTransitionRecord(invalid)).toBeNull();
  });
});

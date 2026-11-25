import { describe, expect, it } from "vitest";

import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  refreshV3ExtractionCutMap,
} from "../../../src/lib/work-unit/decompose-v3-refresh.js";
import type { V3DecomposePreflight } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import {
  createV3DecomposeStarterMap,
  v3OutgoingEdgeId,
  v3PreflightId,
  v3SourceId,
  v3SourceArtifactDigest,
  type V3DecomposeCutMap,
  type V3DecomposeMachine,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

function extractionMap(): V3DecomposeCutMap {
  const map = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
  map.authoring.shape = "extraction";
  map.authoring.destinations = map.authoring.destinations.slice(0, 1);
  return map;
}

function preflight(machine: V3DecomposeMachine): V3DecomposePreflight {
  const starterMap = createV3DecomposeStarterMap(machine);
  const sourceArtifactDigest = v3SourceArtifactDigest([]);
  if (starterMap === null || sourceArtifactDigest === null) throw new Error("valid test preflight");
  return {
    sourceOriginPath: ".arc/active/meta-origin.md",
    sourceArtifactInventory: [],
    sourceArtifactDigest,
    starterMap,
  };
}

function withPreflightId(machine: V3DecomposeMachine): V3DecomposeMachine {
  const { preflightId, ...facts } = machine;
  void preflightId;
  return { preflightId: v3PreflightId(facts), ...facts };
}

describe("refreshV3ExtractionCutMap", () => {
  it("carries the recorded and refreshed operands for scalar machine bindings", () => {
    const sourceMap = extractionMap();
    const sourceMachine = structuredClone(sourceMap.machine);
    sourceMachine.source.ref = "refs/heads/plan/other";
    const refreshedSource = withPreflightId(sourceMachine);
    expect(refreshV3ExtractionCutMap(sourceMap, preflight(refreshedSource))).toEqual({
      status: "reauthor",
      reason: "source-identity",
      locus: "machine.source",
      evidence: {
        expected: {
          origin: sourceMap.machine.source.origin,
          logicalBranch: sourceMap.machine.source.logicalBranch,
          ref: sourceMap.machine.source.ref,
        },
        actual: {
          origin: refreshedSource.source.origin,
          logicalBranch: refreshedSource.source.logicalBranch,
          ref: refreshedSource.source.ref,
        },
      },
    });

    const baseMap = extractionMap();
    const baseMachine = structuredClone(baseMap.machine);
    baseMachine.resultBase.head = "c".repeat(40);
    const refreshedBase = withPreflightId(baseMachine);
    expect(refreshV3ExtractionCutMap(baseMap, preflight(refreshedBase))).toEqual({
      status: "reauthor",
      reason: "result-base",
      locus: "machine.resultBase",
      evidence: { expected: baseMap.machine.resultBase, actual: refreshedBase.resultBase },
    });

    const profileMap = extractionMap();
    const profileMachine = structuredClone(profileMap.machine);
    profileMachine.planningProfile = { kind: "single-spec", sourceDesign: ["spec-origin.md"] };
    const refreshedProfile = withPreflightId(profileMachine);
    expect(refreshV3ExtractionCutMap(profileMap, preflight(refreshedProfile))).toEqual({
      status: "reauthor",
      reason: "planning-profile",
      locus: "machine.planningProfile",
      evidence: { expected: profileMap.machine.planningProfile, actual: refreshedProfile.planningProfile },
    });
  });

  it("requires reauthoring when transferred source bytes change", () => {
    const map = extractionMap();
    const machine = structuredClone(map.machine);
    machine.source.head = "c".repeat(40);
    machine.sourceUnits[0]!.contentDigest = `sha256:${"d".repeat(64)}`;
    const refreshedMachine = withPreflightId(machine);

    const result = refreshV3ExtractionCutMap(map, preflight(refreshedMachine));

    expect(result).toEqual({
      status: "reauthor",
      reason: "source-units",
      locus: "machine.sourceUnits.0.contentDigest",
      evidence: {
        expected: map.machine.sourceUnits[0]!.contentDigest,
        actual: refreshedMachine.sourceUnits[0]!.contentDigest,
      },
    });
    expect(map.machine.source.head).toBe("a".repeat(40));
  });

  it.each(["retained-origin", "drop"] as const)(
    "carries authored %s authority across a unique byte refresh",
    (kind) => {
      const map = extractionMap();
      const retainedLocator = {
        artifact: "draft-origin.md",
        kind: "section" as const,
        level: 2,
        headingSource: "Retained",
        ancestry: [],
        occurrence: 0,
      };
      const retained = {
        sourceId: v3SourceId({
          sourcePath: ".arc/active/draft-origin.md",
          sourceLocator: retainedLocator,
        }),
        sourcePath: ".arc/active/draft-origin.md",
        sourceLocator: retainedLocator,
        contentDigest: `sha256:${"e".repeat(64)}` as const,
      };
      map.machine = withPreflightId({
        ...map.machine,
        sourceUnits: [...map.machine.sourceUnits, retained].sort((left, right) =>
          Buffer.compare(Buffer.from(left.sourceId), Buffer.from(right.sourceId))),
      });
      map.authoring.sourceAllocations = map.machine.sourceUnits.map((unit) =>
        unit.sourceId === retained.sourceId
          ? {
              sourceId: unit.sourceId,
              ownership: "destination-owned" as const,
              disposition: kind === "retained-origin"
                ? { kind }
                : { kind, reason: "obsolete framing" },
            }
          : map.authoring.sourceAllocations[0]!);
      const current = structuredClone(map.machine);
      current.source.head = "c".repeat(40);
      current.sourceUnits.find(({ sourceId }) => sourceId === retained.sourceId)!.contentDigest =
        `sha256:${"f".repeat(64)}`;
      const refreshedMachine = withPreflightId(current);

      const result = refreshV3ExtractionCutMap(map, preflight(refreshedMachine));

      expect(result.status).toBe("refreshed");
      if (result.status !== "refreshed") throw new Error(JSON.stringify(result));
      expect(result.completedMap.authoring.sourceAllocations.find(
        ({ sourceId }) => sourceId === retained.sourceId,
      )?.disposition).toEqual(kind === "retained-origin"
        ? { kind }
        : { kind, reason: "obsolete framing" });
    },
  );

  it("requires reauthoring when changed bytes belong to a repeated-heading identity", () => {
    const map = extractionMap();
    const sourcePath = ".arc/active/draft-origin.md";
    const units = [0, 1].map((occurrence) => {
      const sourceLocator = {
        artifact: "draft-origin.md",
        kind: "section" as const,
        level: 2,
        headingSource: "Repeated",
        ancestry: [],
        occurrence,
      };
      return {
        sourceId: v3SourceId({ sourcePath, sourceLocator }),
        sourcePath,
        sourceLocator,
        contentDigest: `sha256:${String(occurrence + 1).repeat(64)}` as const,
      };
    }).sort((left, right) => Buffer.compare(
      Buffer.from(left.sourceId, "utf8"),
      Buffer.from(right.sourceId, "utf8"),
    ));
    map.machine = withPreflightId({ ...map.machine, sourceUnits: units });
    map.authoring.sourceAllocations = units.map(({ sourceId }, index) => ({
      sourceId,
      ownership: "destination-owned" as const,
      disposition: {
        kind: "target" as const,
        destinationId: "member-a",
        targetLocator: {
          artifact: "draft-member-a.md",
          kind: "section" as const,
          level: 2,
          headingSource: "Repeated",
          ancestry: [],
          occurrence: index,
        },
      },
    }));
    const current = structuredClone(map.machine);
    current.source.head = "c".repeat(40);
    current.sourceUnits[0]!.contentDigest = `sha256:${"e".repeat(64)}`;
    const refreshedMachine = withPreflightId(current);

    expect(refreshV3ExtractionCutMap(map, preflight(refreshedMachine))).toEqual({
      status: "reauthor",
      reason: "source-unit-ambiguous",
      locus: "machine.sourceUnits.0.contentDigest",
    });
  });

  it.each([
    ["hierarchy movement", "source-units", "machine.sourceUnits.0", (machine: V3DecomposeMachine) => {
      const unit = machine.sourceUnits[0]!;
      unit.sourceLocator = {
        artifact: "draft-origin.md",
        kind: "section",
        level: 2,
        headingSource: "Moved",
        ancestry: [],
        occurrence: 0,
      };
      unit.sourceId = v3SourceId({ sourcePath: unit.sourcePath, sourceLocator: unit.sourceLocator });
    }, (prior: V3DecomposeMachine, current: V3DecomposeMachine) => ({
      expected: prior.sourceUnits[0]!,
      actual: current.sourceUnits[0]!,
    })],
    ["added or removed units", "source-units", "machine.sourceUnits.0", (machine: V3DecomposeMachine) => {
      machine.sourceUnits = [];
    }, (prior: V3DecomposeMachine) => ({
      expected: prior.sourceUnits[0]!,
      actual: { kind: "absent" },
    })],
    ["incoming dependency changes", "incoming-edges", "machine.incomingEdges.0",
      (machine: V3DecomposeMachine) => {
        machine.incomingEdges = [];
      }, (prior: V3DecomposeMachine) => ({
        expected: prior.incomingEdges[0]!,
        actual: { kind: "absent" },
      })],
    ["outgoing dependency changes", "outgoing-edges", "machine.outgoingEdges.0",
      (machine: V3DecomposeMachine) => {
        const prerequisite = "foundation";
        machine.outgoingEdges = [{
          edgeId: v3OutgoingEdgeId({ prerequisite }),
          prerequisite,
        }];
      }, (_prior: V3DecomposeMachine, current: V3DecomposeMachine) => ({
        expected: { kind: "absent" },
        actual: current.outgoingEdges[0]!,
      })],
  ] as const)("requires reauthoring after %s", (_label, reason, locus, change, evidence) => {
    const map = extractionMap();
    const machine = structuredClone(map.machine);
    change(machine);
    const refreshedMachine = withPreflightId(machine);

    expect(refreshV3ExtractionCutMap(map, preflight(refreshedMachine))).toEqual({
      status: "reauthor",
      reason,
      locus,
      evidence: evidence(map.machine, refreshedMachine),
    });
  });
});

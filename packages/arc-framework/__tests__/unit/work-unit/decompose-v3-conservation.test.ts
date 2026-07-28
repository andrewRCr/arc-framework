import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  validateV3DecomposeConservation,
  type V3DecomposeConservationInput,
} from "../../../src/lib/work-unit/decompose-v3-conservation.js";
import {
  createV3DecomposeStarterMap,
  v3OutgoingEdgeId,
  v3PreflightId,
  v3SourceId,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";
import type { V3DecomposePreflight } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

function validInput(): V3DecomposeConservationInput {
  const completedMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
  const starterMap = createV3DecomposeStarterMap(structuredClone(completedMap.machine));
  if (starterMap === null) throw new Error("fixture machine must produce a starter map");
  const preflight: V3DecomposePreflight = {
    sourceOriginPath: ".arc/active/meta-origin.md",
    sourceArtifactInventory: [],
    sourceArtifactDigest: canonicalDigest([]),
    starterMap,
  };
  return {
    completedMap,
    currentPreflight: preflight,
    originDependsOn: [],
    workUnits: [{
      slug: "consumer",
      writablePath: ".arc/active/meta-consumer.md",
      dependsOn: ["origin"],
    }],
  };
}

function rebindCurrentPreflight(input: V3DecomposeConservationInput): void {
  const machine = input.completedMap.machine;
  const facts = {
    source: machine.source,
    resultBase: machine.resultBase,
    planningProfile: machine.planningProfile,
    sourceUnits: machine.sourceUnits,
    incomingEdges: machine.incomingEdges,
    outgoingEdges: machine.outgoingEdges,
  };
  input.completedMap.machine.preflightId = v3PreflightId(facts);
  const starterMap = createV3DecomposeStarterMap(structuredClone(input.completedMap.machine));
  if (starterMap === null) throw new Error("updated machine must remain canonical");
  input.currentPreflight.starterMap = starterMap;
}

describe("v3 decomposition allocation and dependency conservation", () => {
  it("returns the exact ordered allocation and dependency edits", () => {
    const input = validInput();

    const result = validateV3DecomposeConservation(input);

    expect(result).toEqual({
      status: "validated",
      allocations: input.completedMap.authoring.sourceAllocations,
      dependencyEdits: [{
        kind: "incoming",
        edgeId: input.completedMap.machine.incomingEdges[0]!.edgeId,
        destinationId: null,
        dependent: "consumer",
        writablePath: ".arc/active/meta-consumer.md",
        beforeTargets: ["origin"],
        afterTargets: ["member-a"],
      }],
    });
  });

  it("restricts source ownership to a compatible destination kind", () => {
    const input = validInput();
    input.completedMap.authoring.sourceAllocations[0]!.ownership = "cohort-shared";

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "ownership",
        reason: "incompatible-source-ownership",
        locus: "authoring.sourceAllocations.0.ownership",
      },
    });
  });

  it("accepts paired-spec artifacts owned by a new member", () => {
    const input = validInput();
    input.completedMap.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "member-a",
      targetLocator: { artifact: "spec-member-a-prd.md", kind: "preamble" },
    };

    expect(validateV3DecomposeConservation(input)).toMatchObject({
      status: "validated",
    });
  });

  it("refuses duplicate destination identities before allocation projection", () => {
    const input = validInput();
    input.completedMap.authoring.destinations[1] = {
      kind: "new-member",
      destinationId: "member-b",
      slug: "member-a",
      workClass: "Light",
    };

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "ownership",
        reason: "duplicate-destination-identity",
        locus: "authoring.destinations.1",
      },
    });
  });

  it("applies live conservation before ownership and ownership before dependency projection", () => {
    const liveFirst = validInput();
    liveFirst.workUnits = [];
    liveFirst.completedMap.authoring.sourceAllocations[0]!.ownership = "cohort-shared";
    expect(validateV3DecomposeConservation(liveFirst)).toMatchObject({
      status: "refused",
      refusal: { stage: "live-conservation" },
    });

    const ownershipFirst = validInput();
    delete ownershipFirst.workUnits[0]!.writablePath;
    ownershipFirst.completedMap.authoring.sourceAllocations[0]!.ownership = "cohort-shared";
    expect(validateV3DecomposeConservation(ownershipFirst)).toMatchObject({
      status: "refused",
      refusal: { stage: "ownership" },
    });
  });

  it.each([
    ["missing destination", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations[0]!.disposition = {
        kind: "target",
        destinationId: "missing",
        targetLocator: { artifact: "draft-member-a.md", kind: "preamble" },
      };
    }, "authoring.sourceAllocations.0.disposition.destinationId", "decoded-map", "authoring-identity"],
    ["incompatible locator", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations[0]!.disposition = {
        kind: "target",
        destinationId: "member-a",
        targetLocator: { artifact: "draft-member-b.md", kind: "preamble" },
      };
    }, "authoring.sourceAllocations.0.disposition.targetLocator", "ownership", expect.any(String)],
  ])("refuses %s at its exact allocation locus", (_name, mutate, locus, stage, reason) => {
    const input = validInput();
    mutate(input);

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage,
        reason,
        locus,
      },
    });
  });

  it.each([
    ["missing", (input: V3DecomposeConservationInput) => {
      input.workUnits = [];
    }, "machine.incomingEdges", "incoming-edge-set-changed", "live-conservation"],
    ["unwritable", (input: V3DecomposeConservationInput) => {
      delete input.workUnits[0]!.writablePath;
    }, "workUnits.consumer.writablePath", "unwritable-dependent", "dependency-projection"],
    ["stale", (input: V3DecomposeConservationInput) => {
      input.workUnits[0]!.dependsOn = ["origin", "other"];
    }, ".arc/active/meta-consumer.md", "stale-dependent", "dependency-projection"],
  ])("refuses a %s incoming dependent", (_name, mutate, locus, reason, stage) => {
    const input = validInput();
    mutate(input);

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: { stage, reason, locus },
    });
  });

  it.each([
    ["omitted", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations = [];
    }, "decoded-map", "authoring.sourceAllocations"],
    ["duplicated", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations.push(
        structuredClone(input.completedMap.authoring.sourceAllocations[0]!),
      );
    }, "decoded-map", "authoring.sourceAllocations"],
    ["changed", (input: V3DecomposeConservationInput) => {
      input.currentPreflight.starterMap.machine.sourceUnits[0]!.contentDigest = canonicalDigest("changed");
      const machine = input.currentPreflight.starterMap.machine;
      machine.preflightId = v3PreflightId({
        source: machine.source,
        resultBase: machine.resultBase,
        planningProfile: machine.planningProfile,
        sourceUnits: machine.sourceUnits,
        incomingEdges: machine.incomingEdges,
        outgoingEdges: machine.outgoingEdges,
      });
    }, "machine-binding", "machine.sourceUnits.0"],
    ["added", (input: V3DecomposeConservationInput) => {
      const locator = { artifact: "notes-origin.md", kind: "whole-file" as const };
      input.completedMap.machine.sourceUnits.push({
        sourceId: v3SourceId({ sourcePath: ".arc/active/notes-origin.md", sourceLocator: locator }),
        sourcePath: ".arc/active/notes-origin.md",
        sourceLocator: locator,
        contentDigest: canonicalDigest("added"),
      });
      input.completedMap.machine.sourceUnits.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
      rebindCurrentPreflight(input);
      input.completedMap.machine.sourceUnits = input.completedMap.machine.sourceUnits.filter(
        ({ sourcePath }) => sourcePath !== ".arc/active/notes-origin.md",
      );
      const machine = input.completedMap.machine;
      input.completedMap.machine.preflightId = v3PreflightId({
        source: machine.source,
        resultBase: machine.resultBase,
        planningProfile: machine.planningProfile,
        sourceUnits: machine.sourceUnits,
        incomingEdges: machine.incomingEdges,
        outgoingEdges: machine.outgoingEdges,
      });
    }, "machine-binding", expect.stringMatching(/^machine\.sourceUnits\.\d+$/u)],
  ])("refuses an %s source unit before ownership planning", (_name, mutate, stage, locus) => {
    const input = validInput();
    mutate(input);

    const result = validateV3DecomposeConservation(input);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal.stage).toBe(stage);
    expect(result.refusal.locus).toEqual(locus);
  });

  it.each([
    ["unknown recipient", ["ghost"]],
    ["retiring origin", ["origin"]],
  ])("refuses an incoming replacement with %s", (_name, replacementTargets) => {
    const input = validInput();
    input.completedMap.authoring.incomingDispositions[0]!.disposition = {
      kind: "replace",
      replacementTargets,
    };

    const result = validateV3DecomposeConservation(input);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal).toMatchObject({
      stage: "decoded-map",
      reason: "authoring-identity",
      locus: "authoring.incomingDispositions.0.disposition.replacementTargets.0",
    });
  });

  it("projects outgoing prerequisites to their exact recipient slots", () => {
    const input = validInput();
    const outgoing = {
      prerequisite: "foundation",
      edgeId: v3OutgoingEdgeId({ prerequisite: "foundation" }),
    };
    input.completedMap.machine.outgoingEdges = [outgoing];
    input.completedMap.authoring.outgoingDispositions = [{
      edgeId: outgoing.edgeId,
      disposition: { kind: "targets", targets: ["member-a"] },
    }];
    input.originDependsOn = ["foundation"];
    rebindCurrentPreflight(input);

    const result = validateV3DecomposeConservation(input);

    expect(result).toMatchObject({ status: "validated" });
    if (result.status !== "validated") return;
    expect(result.dependencyEdits).toContainEqual({
      kind: "outgoing",
      edgeId: outgoing.edgeId,
      destinationId: "member-a",
      dependent: "member-a",
      writablePath: null,
      beforeTargets: [],
      afterTargets: ["foundation"],
    });
    expect(result.dependencyEdits.map(({ edgeId }) => edgeId)).toEqual(
      [...result.dependencyEdits.map(({ edgeId }) => edgeId)].sort(),
    );
  });

  it("projects internal member dependencies as canonical edge edits", () => {
    const input = validInput();
    input.completedMap.authoring.internalEdges = [{ from: "member-a", to: "member-b" }];

    const result = validateV3DecomposeConservation(input);

    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.dependencyEdits).toContainEqual({
      kind: "internal",
      edgeId: canonicalDigest({
        schemaVersion: 3,
        kind: "internal",
        from: "member-a",
        to: "member-b",
      }),
      destinationId: "member-a",
      dependent: "member-a",
      writablePath: null,
      beforeTargets: [],
      afterTargets: ["member-b"],
    });
  });

  it("chains same-dependent edits in canonical edge order", () => {
    const input = validInput();
    input.completedMap.authoring.shape = "heterogeneous";
    input.completedMap.authoring.placement = { kind: "direct-member" };
    input.completedMap.authoring.destinations = [
      {
        kind: "existing-home",
        destinationId: "consumer",
        target: { kind: "work-unit", slug: "consumer" },
      },
      { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
    ];
    const outgoing = {
      prerequisite: "foundation",
      edgeId: v3OutgoingEdgeId({ prerequisite: "foundation" }),
    };
    input.completedMap.machine.outgoingEdges = [outgoing];
    input.completedMap.authoring.outgoingDispositions = [{
      edgeId: outgoing.edgeId,
      disposition: { kind: "targets", targets: ["consumer"] },
    }];
    input.originDependsOn = ["foundation"];
    rebindCurrentPreflight(input);

    const result = validateV3DecomposeConservation(input);

    expect(result).toMatchObject({ status: "validated" });
    if (result.status !== "validated") return;
    const consumerEdits = result.dependencyEdits.filter(({ dependent }) => dependent === "consumer");
    expect(consumerEdits).toHaveLength(2);
    expect(consumerEdits[0]!.afterTargets).toEqual(consumerEdits[1]!.beforeTargets);
    expect([...consumerEdits.at(-1)!.afterTargets].sort()).toEqual(["foundation", "member-a"]);
  });
});
